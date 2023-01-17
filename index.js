const express = require('express')
const cors = require('cors')
const app = express();
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;
//middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rrnpcbx.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    console.log('token inside verified',req.headers.authorization);
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('unauthorized access')
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }

        req.decoded = decoded;
        next();
    })

}



async function run (){
    try{

    const appointOptionCollection = client.db('health-is-wealth').collection('appointmentOptions');
    const bookingCollection = client.db('health-is-wealth').collection('bookings') ;
    const usersCollection = client.db('health-is-wealth').collection('users') ;
    const doctorsCollection = client.db('health-is-wealth').collection('doctors') ;
    const paymentsCollection = client.db('health-is-wealth').collection('payments') ;


    //verify admin
    const verifyAdmin = async(req,res,next) =>{
        const decodedEmail = req.decoded.email;
         const query = {email: decodedEmail}
        const user = await usersCollection.findOne(query)
        if(user?.role !== 'admin'){
            return res.status(403).send({message: 'Forbidden access'})
        }
        next();
    }



    app.get('/appointmentOptions', async(req,res) =>{ 
     const date = req.query.date;
     console.log(date)   
    const query ={};
    const options = await appointOptionCollection.find(query).toArray();
    const bookingQuery = {appointmentDate: date}
    const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
    options.forEach(option =>{
        const optionBooked = alreadyBooked.filter(book =>book.treatment === option.name)
        const bookedSlots = optionBooked.map(book =>book.slot);
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots = remainingSlots;
       
    })
    
    res.send(options)
    
    })
    //specialty
    app.get('/appointmentSpecialty', async(req,res) =>{
        const query ={}
        const result = await appointOptionCollection.find(query).project({name:1}).toArray()
        res.send(result)
    })
    


    app.get('/bookings',verifyJWT, async(req,res) =>{
        const email = req.query.email;
       
        // console.log('token',req.headers.authorization);
        const decodedEmail = req.decoded.email;

        if(email !== decodedEmail){
            return res.status(403).send({message: 'forbidden access'});
        }
        const query = {email: email};
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings)
    })

    app.get('/users', async(req,res) =>{
        const query = {};
        const result = await usersCollection.find(query).toArray();
        res.send(result)
    })
    app.get('/bookings/:id', async(req,res) =>{
        const id = req.params.id;
        const query ={ _id:ObjectId(id) };
        const booking = await bookingCollection.findOne(query)
        res.send(booking)


    })
    
    app.post ('/bookings' , async(req,res) =>{
        const booking = req.body;
        const query ={
            appointmentDate: booking.appointmentDate,
            email: booking.email,
            treatment: booking.treatment

        }
        const alreadyBooked = await bookingCollection.find(query).toArray();
        if(alreadyBooked.length){
            const message =`You already have a booking on ${booking.appointmentDate} time: ${booking.slot} `
            return res.send({acknowledged:false, message})
        }

        const result = await bookingCollection.insertOne(booking);
        res.send(result)
    })

    app.post('/create-payment-intent', async(req, res) =>{
        const booking = req.body;
        const price = booking.price;
        const amount = price *100;

        const paymentIntent = await stripe.paymentIntents.create({
            currency: 'usd',
            amount:amount,
            "payment_method_types": [
                "card"
            ]
        });
        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    })







    app.get('/jwt', async(req,res) =>{
        const email = req.query.email;
        const query = {email:email}
        const user = await usersCollection.findOne(query);
        // console.log(user)
        // res.send({accessToken: 'token'})
        if(user){
            const token = jwt.sign({email}, process.env.JWT_TOKEN, {expiresIn: '7d'})
            return res.send({accessToken: token});
        }
        console.log(user)
        res.status(403).send({accessToken: ''})
       
    })

    app.get('/users/admin/:email', async (req,res) =>{ 
        const email = req.params.email;
        const query = { email }
        const user = await usersCollection.findOne(query);
        res.send({isAdmin: user?.role === 'admin'});
    })

    app.post ('/users', async(req,res) =>{
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.send(result)
    })

    app.put('/users/admin/:id',verifyJWT,verifyAdmin, async(req, res) =>{
        
        const id= req.params.id;

        const filter = { _id: ObjectId(id) }
        const options = { upsert: true};
        const updatedDoc = {
            $set: {
                role: 'admin'

            }
        }
        const result = await usersCollection.updateOne(filter,updatedDoc,options);
        res.send(result)
    });
    app.get('/doctors',verifyJWT, verifyAdmin, async(req,res) =>{
        const query ={}
        const doctors = await doctorsCollection.find(query).toArray();
        res.send(doctors)
    })

    app.post('/doctors',verifyJWT,verifyAdmin, async(req,res) =>{
        const doctor = req.body;
        const result = await doctorsCollection.insertOne(doctor);
        res.send(result)

    })

    //temporary to  update price field on appointment options
    app.get('/addprice',async(req,res) =>{
        const filter ={}
        const options ={ upsert: true}
        const updatedDoc ={
            $set:{
                price: 150
            }
        }
        const result = await appointOptionCollection.updateMany(filter,updatedDoc,options)
        res.send(result)
    })

    app.delete('/doctors/:id',verifyJWT,verifyAdmin, async(req,res) =>{
        const id = req.params.id;
        const filter = { _id:ObjectId(id)}
        const result = await doctorsCollection.deleteOne(filter);
        res.send(result)
    })


    app.post('/payments', async(req,res) =>{
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment)
        const id = payment.bookingId;
        const filter ={ _id: ObjectId(id)}
        const updatedDoc ={
            $set: {
                paid: true,
                transactionId:payment.transactionId
            }
        }
        const updateResult = await bookingCollection.updateOne(filter,updatedDoc)
        res.send(updateResult)
    })




    }


    finally{

    }
}

run().catch(console.log)

app.get('/',async(req,res) =>{
    res.send('health is wealth server is running')
})


app.listen(port, () =>{
    console.log(`health is wealth server is running on ${port}`)
})
