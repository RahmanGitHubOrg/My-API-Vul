var VF_PenTestFindingsImport = Class.create();
VF_PenTestFindingsImport.prototype = {

    initialize: function() {
        // Array holding the logs
        this.lastExecutionLog = [];
        // Flag to enable/disable logging
        this.shouldLog = false;
    },


    /**
     * Import findings for the Pen Test Assessment Request.
     *
     * @param {type} penTestAssessmentRequestId - The ID of the Pen Test Assessment Request.
     * @return {type} true if the import was successful, false otherwise.
     */
    importFindings: function(penTestAssessmentRequestId) {
        // Get the Pen Test record, that has Import Config
        var recordInfo = this.getRecordInfo(penTestAssessmentRequestId);

        var result = {
            success: false,
            message: ""
        };


        try {
            var self = this;

            // Find the excel mapping
            var excelMappingInfo = this.getMappingDefinition(recordInfo.definitionSysId);
            var excelMappings = JSON.parse(excelMappingInfo.mapping);
            var mergeFieldsMapping = excelMappings.filter(function(item) {
                return item.process === "merge_fields";
            });

            self.log("Process started: " + new GlideDateTime().getDisplayValue());

            // Find the attachment to import
            var attachmentSysId = this.getAttachmentId(recordInfo.recordSysId);
            self.log("Attachment ID: " + attachmentSysId);

            // Read the excel file and process each row
            var helper = new global.VF_ExcelReaderHelper(attachmentSysId);

            // For each row of the Excel
            helper.forEachRow(function(row) {
                self.log("Excel row: " + JSON.stringify(row));
				self.validateForMandatoryFields(excelMappings, row);

                var glideVI = new GlideRecord(excelMappingInfo.tableName);
                glideVI.initialize();
                glideVI.setValue("assessment_request", penTestAssessmentRequestId);

                // Go through each columns, find the mappings, get the data and set the GlideRecord
                for (var column in row) {
                    self.log("Processing column: " + column);
                    var mapping = self.findMapping(excelMappings, column);
                    self.log("Column mapping: " + JSON.stringify(mapping));

                    if (mapping && mapping.length > 0) {
                        var mappingField = mapping[0];
                        var data = self.getFieldData(row, column, mappingField, excelMappingInfo);

                        if (mappingField.process == "date" || mappingField.process == "lookup") {
                            glideVI.setValue(mappingField.destination_field, data);
                        } else {
                            glideVI.setDisplayValue(mappingField.destination_field, data);
                        }
                    }
                }

                // Go through all the calculated fields. These fields don't have mappings
                mergeFieldsMapping.forEach(function(fieldMapping) {
                    self.log("Processing fields_to_merge column: " + fieldMapping.label);
                    var data = self.getFieldData(row, fieldMapping.label, fieldMapping, excelMappingInfo);
                    glideVI.setDisplayValue(fieldMapping.destination_field, data);
                });

                var id = glideVI.insert();
                self.log("Record Created: " + id);

            });

            self.log("Process completed successfully: " + new GlideDateTime().getDisplayValue());
            self.updateDefinitionLog(recordInfo.definitionSysId, self.lastExecutionLog.join("\n\n").toString());

            result.success = true;
            return result;

        } catch (e) {
            var message = gs.getMessage("There was error importing the Pen Test findings: ") + e;
            gs.error("VF: " + message);
            self.log(message);
            self.updateDefinitionLog(recordInfo.definitionSysId, message);
            result.message = message;
        }

        return result;
    },

     /**
     * Validate the Excel row has at the least the mandatory fields. Find the field label based on the mapping and then validate if that field exists in the Excel
	 * 
     *
     * @param {object} row - Excel row
     * @param {object} fieldMapping - mapping definition
     */
	validateForMandatoryFields : function(excelMappings, row){
		// Find labels for "technical_details" and "steps_to_reproduce"
		var technicalDetailsLabel = this.findMappingByField(excelMappings, "technical_details");
		var stepsToReproduceLabel = this.findMappingByField(excelMappings, "steps_to_reproduce");

		// Check if row has fields for "technical_details" and "steps_to_reproduce"
		var technicalDetailsExists = 
			technicalDetailsLabel.length > 0 && row.hasOwnProperty(technicalDetailsLabel[0].label);
		var stepsToReproduceExists = stepsToReproduceLabel.length > 0 && row.hasOwnProperty(stepsToReproduceLabel[0].label);

		if(!technicalDetailsExists || !stepsToReproduceExists){
			throw "The Excel and the Mapping Configuration need to have at least the mandatory fields: 'Technical details', 'Steps to reproduce'";
		}

	},


    /**
     * Get field data based on configuration type
     *
     * @param {object} row - Excel row
     * @param {string} column - Column name of the excel
     * @param {object} fieldMapping - mapping definition
     * @param {object} mappingConfig - the whole mapping record
     */
    getFieldData: function(row, column, fieldMapping, mappingConfig) {
        switch (fieldMapping.process) {
            case "merge_fields":
                return this.getMergeFieldData(row, column, fieldMapping, mappingConfig);
            case "date":
                return this.getSystemDate(row[column], mappingConfig.dateFormat);
            case "lookup":
                return this.lookUpValue(fieldMapping, row, column);
            case "dynamic":
                return this.getDynamicData(fieldMapping, row, column, mappingConfig);
            case "choice":
                return this.getChoiceData(fieldMapping, row, column);
            default:
                return row[column];
        }
    },

    /**
     * Get the field data dynamically by invoking a script include function
     *
     * @param {object} fieldMapping - mapping definition for this field
     * @param {object} excelRowData - Excel row
     * @param {string} columnName - Column name of the excel
     * @param {GlideRecord} mappingConfig - GlideRecord of the whole mapping configuration record
     */
    getDynamicData: function(fieldMapping, excelRowData, columnName, mappingConfig) {
        var scriptIncludeArray = fieldMapping.script_include.split(".");

        var data = "";
        if (scriptIncludeArray.length > 0) {
            // config is in the form of ScriptInclude.method. We split and dynamically
            // invokes the method and pass the parameters. NB: It should be a global script include. The script should return a value for the field
            var columnValue = excelRowData[columnName];
            var dynamicSI = new global[scriptIncludeArray[0]]();
            var funcName = scriptIncludeArray[1];
            data = dynamicSI[funcName](columnValue, columnName, excelRowData, fieldMapping, mappingConfig);

        } else {
            this.log(column + ": Invalid option has been specified: (" + excelRowData[columnName] + ")");
        }

        return data;
    },

    /**
     * Look up sys_choice value
     *
     * @param {object} mapping - mapping definition
     * @param {object} row - Excel row
     * @param {string} column - Column name of the excel
     */
    getChoiceData: function(mapping, row, column) {
        retVal = "";
        var query = mapping.lookup_query;
        query = query.replace("$1", row[column]);

        var lookUpGr = new GlideRecord("sys_choice");
        lookUpGr.addEncodedQuery(query);
        lookUpGr.setLimit(1);
        lookUpGr.query();

        if (lookUpGr.next()) {
            retVal = lookUpGr.getValue("value");
        } else {
            this.log(column + ": Invalid option has been specified (" + row[column] + ")");
        }

        return retVal;
    },

    /**
     * Look up refrence field sys_id
     *
     * @param {object} mapping - mapping definition
     * @param {object} row - Excel row
     * @param {string} column - Column name of the excel
     */
    lookUpValue: function(mapping, row, column) {
        retVal = "";
        var query = mapping.lookup_query;
        query = query.replace("$1", row[column]);

        var lookUpGr = new GlideRecord(mapping.lookup_table);
        lookUpGr.addEncodedQuery(query);
        lookUpGr.setLimit(1);
        lookUpGr.query();

        if (lookUpGr.next()) {
            retVal = lookUpGr.getUniqueValue();
        } else {
            this.log(column + ": Invalid option has been specified (" + row[column] + ")");
        }

        return retVal;
    },


    /**
     * Updates the definition log if logging is enabled.
     *
     * @param {object} row - Excel row
     * @param {string} column - Column name of the excel
     * @param {object} fieldMapping - mapping definition
     * @param {object} mappingConfig - the whole mapping record
     */
    getMergeFieldData: function(row, column, fieldMapping, mappingConfig) {
        var fieldsToMerge = fieldMapping.fields_to_merge.split(",");

        if (fieldsToMerge.length > 0) {
            var mergeChar = fieldMapping.merge_character || " ";
            return row[fieldsToMerge[0].trim()] + mergeChar + row[fieldsToMerge[1].trim()];
        } else {
            this.log(gs.getMessage("Destination_fields_to_merge fields not defined for the column: ") + column);
        }

        return row[column];
    },

    log: function(message) {
        if (this.shouldLog) {
            this.lastExecutionLog.push(message);
        }
    },

    /**
     * Updates the definition log if logging is enabled.
     *
     * @param {type} definitionId - The ID of the definition.
     * @param {type} logDetails - Details to be logged.
     * @return {type} Description of what the function returns.
     */
    updateDefinitionLog: function(definitionId, logDetails) {
        if (this.shouldLog) {
            var helper = new sn_vul.VF_PenTestFindingsImportHelper();
            helper.updateDefinitionLog(definitionId, logDetails);
        }
    },

    /**
     * Retrieves the ID of the latest attachment for a given record.
     *
     * @param {string} sys_id - The sys_id of the record.
     * @return {string|null} The sys_id of the latest attachment, or null if no attachment is found.
     */
    getAttachmentId: function(sys_id) {

        if (!sys_id) {
            throw gs.getMessage("Attachment ID is required.");
        }

        var attachmentGR = new GlideRecord('sys_attachment');
        // Add query to filter attachments related to your specified record. Get the last attachment for the record
        attachmentGR.addQuery('table_sys_id', sys_id);
        attachmentGR.addQuery('content_type', 'application/vnd.ms-excel')
            .addOrCondition('content_type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); // Either xls or xlxs formats!
        attachmentGR.orderByDesc("sys_created_on");
        attachmentGR.setLimit(1);
        attachmentGR.query();

        while (attachmentGR.next()) {
            return attachmentGR.sys_id;
        }

        throw gs.getMessage("The Pen Test Assessment Request does not have any valid Excel attachments to be imported.");
    },

    /**
     * Read the Pen Test Assessment Request record
     *
     * @param {GUID} recordSysId - The ID of the record to retrieve information for.
     * @return {type} An object containing the sys_id and pen test configuration id.
     */
    getRecordInfo: function(recordSysId) {

        if (!recordSysId) {
            throw gs.getMessage("Pen Test Assessment Request ID is required.");
        }

        var info = {
            recordSysId: "",
            definitionSysId: "",
        };

        var grSVPTAR = new GlideRecord('sn_vul_pen_test_assessment_request');
        if (grSVPTAR.get(recordSysId)) {
            info.recordSysId = grSVPTAR.getUniqueValue();
            info.definitionSysId = grSVPTAR.getValue("u_pen_test_configuration");
        } else {
            throw gs.getMessage("Pen Test Assessment Request not found.");
        }

        return info;
    },

    /**
     * Retrieves the Pen test configuration for mapping definition based on the provided Pen Test Assessment Request.
     *
     * @param {GUID} recordSysId - The ID of the record to retrieve the mapping for.
     * @return {type} An object containing the mapping, date format, logging status, and table name.
     */
    getMappingDefinition: function(recordSysId) {

        if (!recordSysId) {
            throw "Pen Test configuration ID is required.";
        }


        var info = {
            mapping: '',
            dateFormat: '',
            loggingEnabled: false,
            tableName: ''
        };

        var grUEID = new GlideRecord('sn_vul_pen_test_configuration');
        if (grUEID.get(recordSysId)) {
            info.mapping = grUEID.getDisplayValue('u_mappings');
            info.dateFormat = grUEID.getValue("u_source_date_format");
            info.loggingEnabled = grUEID.getValue("u_logging_enabled") == 1;
            info.tableName = grUEID.getValue("u_import_table");
            this.shouldLog = info.loggingEnabled;
        } else {
            throw gs.getMessage("Invalid Pen Test configuration ID: ") + recordSysId;
        }

        var infoLog = JSON.stringify(info).replace(/\r\n\t/g, '');
        this.log("Mapping Details: " + infoLog);

        return info;

    },

    /**
     * Finds a mapping in the provided excelMappings based on the given label.
     *
     * @param {array} excelMappings - The array of mappings to search.
     * @param {string} label - The label to search for in the mappings.
     * @return {object} The filtered array of mappings that match the label.
     */
    findMapping: function(excelMappings, label) {
        return excelMappings.filter(function(item) {
            return item.label === label;
        });
    },

	/**
     * Finds a mapping in the provided excelMappings based on the given destination field.
     *
     * @param {array} excelMappings - The array of mappings to search.
     * @param {string} label - The label to search for in the mappings.
     * @return {object} The filtered array of mappings that match the label.
     */
    findMappingByField : function(excelMappings, destination_field) {
        return excelMappings.filter(function(item) {
            return item.destination_field === destination_field;
        });
    },

    /**
     * Returns the display value of a GlideDateTime object created from the given value and format.
     *
     * @param {string} value - The input value to be converted to a GlideDateTime object.
     * @param {string} format - The format of the input value.
     * @return {string} The display value of the GlideDateTime object.
     */
    getSystemDate: function(value, format) {
        if (!format) {
            throw gs.getMessage("Please configure the date format in the Pen Test Configuration record.");
        }

        var dateTime = new GlideDateTime();
        dateTime.setDisplayValue(value, format);
        var convertedDate = dateTime.getLocalDate().getValue();
        this.log("Input date: " + value + " Format: " + format, " Output date: " + convertedDate);
        return convertedDate;
    },

    type: 'VF_PenTestFindingsImport'
};
