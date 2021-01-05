
const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

express()
  .use(express.static(path.join(__dirname, 'public')))
  .use(express.urlencoded({extended: true}))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/test', (req, res) => res.render('pages/test', {users: ["John", "Paul", "Ringo"]}))
  .get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
  })
  .get('/order', (req, res) => {
      const first_name = (req.query.first) ? req.query.first : "";
      const last_name = (req.query.last) ? req.query.last : "";
      
      let entree = "";
      let sideList = ""
      let order = "";
      if (req.query.entree) {
        entree = req.query.entree;
        sideList = getSides(req.query);
        order = getOrderText(entree, sideList);
      }
      
      let menu_info = {first: first_name, last: last_name,
                       order: order}

      if (validateMenu(first_name, last_name, entree, sideList)) {
        let confirm_info = menu_info;
        confirm_info.streetaddress = "";
        confirm_info.cityaddress = "";

        res.render('pages/confirmation', confirm_info);
      } else {
        res.render('pages/menu', menu_info);
      }
  })
  .post('/confirm', async (req, res) => {
      const first_name     = req.body.first;
      const last_name      = req.body.last;
      const street_address = req.body.streetaddress;
      const city_state     = req.body.cityaddress;
      const order          = req.body.order;

      let confirm_info = {first: first_name, last: last_name, streetaddress: street_address,
                          cityaddress: city_state, order: order};
        
      if (validateConfirm(first_name, last_name, street_address, city_state, order)) {
          // Push the new information to the database
          // and get the result for the new order number
          //
          // example insert
          // INSERT INTO order_table (first_name, last_name, street_address, 
          //                          city_address, food_order, order_time, order_status)
          // VALUES ('Hope', 'Dog', '12 Street St', 'Northampton, MA', 
          //         'Fake order foods 4', now(), 'Received') 
          // RETURNING id;
          let query_text = "INSERT INTO order_table (first_name, last_name, street_address, ";
          query_text += "city_address, food_order, order_time, order_status) ";
          query_text += "VALUES ('" + first_name + "', '" + last_name + "', '" + street_address + "', '";
          query_text += city_state + "', '" + order + "', now(), 'Received') RETURNING id;";

          try {
              const client = await pool.connect();

              // INSERT the new order information
              const result = await client.query(query_text);

              // get the new ID number returned from the INSERT query
              const order_number = (result) ? result.rows[0].id : null; 

              // with the new order number, get the appropriate customer info
              const select_result = await client.query('SELECT * FROM order_table WHERE id = ' + order_number);
              const results = (select_result) ? select_result.rows[0] : null;

              const order_status   = results.order_status;
              const first_name     = results.first_name;
              const last_name      = results.last_name;
              const street_address = results.street_address;
              const city_state     = results.city_address;
              const order          = results.food_order;

              let customer_info = {first: first_name, last: last_name, streetaddress: street_address,
                                   cityaddress: city_state, order: order, ordernumber: order_number,
                                   orderstatus: order_status};

              res.render('pages/customerstatus', customer_info);
              client.release();
           } catch (err) {
              console.error(err);
              res.send("Error " + err);
           }
      } else {
          res.render('pages/confirmation', confirm_info);
      }
  })
  // /status is the customer facing status page
  .get('/status', async (req, res) => {
      // replace first_name and everything from body with only the order number
      // the order number should be used to retrieve everything from the database.
      const order_number = req.query.ordernumber;
     
      // retrieve order info from database, determined by ordernumber
      //
      try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM order_table WHERE id = ' + order_number);
        const results = (result) ? result.rows[0] : null;
      
        // assemble the local variables for the order status
        const order_status   = results.order_status;
        const first_name     = results.first_name;
        const last_name      = results.last_name;
        const street_address = results.street_address;
        const city_state     = results.city_address;
        const order          = results.food_order;

        let customer_info = {first: first_name, last: last_name, streetaddress: street_address,
                             cityaddress: city_state, order: order, ordernumber: order_number,
                             orderstatus: order_status};

        res.render('pages/customerstatus', customer_info);
        client.release();
      } catch (err) {
        console.error(err);
        res.send("Error " + err);
      }
  })
  .get('/service', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT * FROM order_table');
      const results = (result) ? result.rows : null;

      console.log(results)
      let orders = [];

      // format the db results into orders 
      orders.push({ timestamp: "",
                    order: "",
                    id: "",
                    first: "",
                    last: "",
                    streetaddress: "test",
                    cityaddress: "test,MA",
                    orderstatus: "Received"});
                   

      res.render('pages/servicestatus', {orders: orders}); 
      client.release();
    } catch (err) { console.error(err); res.send("Error " + err);
    }

  })
  // /db is a debugging view into the complete order_table database table
  .get('/db', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT * FROM order_table');
      const results = { 'results': (result) ? result.rows : null};
      res.render('pages/db', results );
      client.release();
    } catch (err) {
      console.error(err);
      res.send("Error " + err);
    }
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))


/*  HELPER FUNCTIONS BELOW 
 */

// server side validation for the menu page submissions
function validateMenu(first_name, last_name, entree, sideList) {
    let valid = false;

    if (first_name.length != 0 &&
        last_name.length != 0 && 
        entree != undefined && 
        sideList.length === 3) {
        valid = true;
    }

    return valid;
}

// server side validaiton for the confirm page submissions
function validateConfirm(first_name, last_name, street_address, city_state, order) {
    let valid = false;

    if (first_name.length != 0 &&
        last_name.length != 0 && 
        street_address.length != 0 &&
        city_state.length != 0 &&
        order.length != 0 ) {
        valid = true;
    }

    return valid;
}

// build a single string formatted order from the 
// entree and sides
function getOrderText(entree, sideList) {
    order = entree;

    sideList.forEach(function(r) {
        order += ", " + r;
    });
    return order;
}

// convert the item's buttons into strings
// for each of the side dishes
function getSides(body) {
    sides = [];
    
    if (body.item0 === "on")
        sides.push("Corn Bread")
    if (body.item1 === "on")
        sides.push("Creamed Corn")
    if (body.item2 === "on")
        sides.push("Green Beans")
    if (body.item3 === "on")
        sides.push("Mashed Potatos")
    if (body.item4 === "on")
        sides.push("Baked Beans")

    return sides;
}
