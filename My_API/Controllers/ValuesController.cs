﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace My_API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ValuesController : ControllerBase
    {
        private ValuesDao valuesDao;
        private ValuesDaoV2 valuesDao2;

        public ValuesController()
        {
            valuesDao = new ValuesDao();
            valuesDao2 = new ValuesDaoV2();
        }
        // GET api/values
        [HttpGet]
        public ActionResult<IEnumerable<string>> Get()
        {
            return new string[] { "value1", "value2" };
        }

        // GET api/values/5
        [HttpGet("{id}")]
        public ActionResult<string> Get(string id)
        {

            return valuesDao.getValue(id);
        }


        [HttpGet("{id}")]
        public ActionResult<string> GetV2(string id)
        {
            var data = valuesDao.getValue2(id);

            return Ok(data);
        }

        [HttpGet("{id}")]
        public ActionResult<string> GetV3(string id)
        {
            var data = valuesDao2.getValue(id);

            return Ok(data);
        }

        [HttpGet("{id}")]
        public ActionResult<string> GetV4(string id)
        {
            var data = valuesDao2.getValue2(id);

            return Ok(data);
        }

        // POST api/values
        [HttpPost]
        public void Post([FromBody] string value)
        {
        }

        // PUT api/values/5
        [HttpPut("{id}")]
        public void Put(int id, [FromBody] string value)
        {
        }

        // DELETE api/values/5
        [HttpDelete("{id}")]
        public void Delete(int id)
        {
        }
    }
}

