using System;
using System.Data;
using System.Data.SqlClient;

namespace My_API.Controllers {

    public class ValuesDaoV2 {
        
        public string getValue(string id) {
                        var connection = new SqlConnection();
            try
            {
                connection.ConnectionString = "db info";
                connection.Open();
                var selectSql = string.Format("select from MyStuff where id='{0}';", id);
                var selectCommand = new SqlCommand(selectSql, connection);

                var dataReader = selectCommand.ExecuteReader();
                return dataReader.GetString(0);
            }
            catch (Exception ex)
            {
            }
            finally
            {
                if (connection.State == ConnectionState.Open)
                {
                    connection.Close();
                }
            }
            return null;
        } 
        
        // TODO: Just for test,this is just for testing if two VIs are created for this
        public string getValue2(string id) {
                        var connection = new SqlConnection();
            try
            {
                connection.ConnectionString = "db info";
                connection.Open();
                var selectSql = string.Format("select from MyStuff where id='{0}';", id);
                var selectCommand = new SqlCommand(selectSql, connection);

                var dataReader = selectCommand.ExecuteReader();
                return dataReader.GetString(0);
            }
            catch (Exception ex)
            {
            }
            finally
            {
                if (connection.State == ConnectionState.Open)
                {
                    connection.Close();
                }
            }

            return null;
        }
    }
}