require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const app = express()
const port = process.env.PORT || 4000;

// middleware 
app.use(cookieParser())
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json())


const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    console.log("No token found");
    return res.status(401).send({ message: 'unauthorized' });
  }

  jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
    if (err) {
      console.log("Invalid token");
      return res.status(401).send({ message: 'unauthorized' });
    }
    req.user = decoded;
    next();
  });
};


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vtrz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    app.post('/jwt', (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.SECRET_TOKEN, {
        expiresIn: '365d'
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });

    })
    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    });




    const trainnersCollection = client.db("TrainersDB").collection("trainers")
    const usersCollection = client.db("UsersDB").collection("users")
    const classesCollection = client.db("ClassesDB").collection("Classes")
    const bookingsCollection = client.db("BookingsDB").collection("Bookings")
    const paymentsCollection = client.db("PaymentsDB").collection("Payments")
    const applyTrainerCollection = client.db("ApplyTrainerDB").collection("ApplyTrainer")
    const reviewsCollection = client.db("ReviewsDB").collection("Reviews")
    const forumPostsCollection = client.db("ForumPostsDB").collection("ForumPosts")
    const newsletterSubscribersCollection = client.db("NewsletterSubscribersDB").collection("NewsletterSubscribers")


    app.get('/trainers', async (req, res) => {
      try {
        const result = await trainnersCollection.find({}).toArray();
        res.status(200).send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch trainners', error })

      }
    })
    const { ObjectId } = require('mongodb');


    app.get('/trainers/:id', async (req, res) => {
      try {
        const id = req.params.id;

        // Validate ObjectId before using it
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const trainer = await trainnersCollection.findOne({ _id: new ObjectId(id) });

        if (!trainer) {
          return res.status(404).send({ message: "Trainer not found" });
        }

        res.status(200).send(trainer);
      } catch (error) {
        res.status(500).send({ message: "Error retrieving trainer", error });
      }
    });
    app.post("/trainer/booking", async (req, res) => {
      try {
        const { trainerId, slotId, packageName, price, slotName, userName, userEmail } = req.body;
        const newBooking = {
          trainerId,
          slotId,
          slotName,
          packageName,
          price,
          userName,
          userEmail,
          bookingDate: new Date(),
        };

        const result = await bookingsCollection.insertOne(newBooking);

        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving booking:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get('/trainer/booking', verifyToken, async (req, res) => {
      try {
        const result = await bookingsCollection.find({}).toArray();
        res.status(200).send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch trainners', error })

      }
    })
    app.get('/applytrainer', async (req, res) => {
      try {
        const result = await applyTrainerCollection.find({}).toArray()
        res.status(200).send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch trainners', error })
      }
    })
    app.post('/applytrainer', async (req, res) => {
      try {
        const application = req.body;
        const result = await applyTrainerCollection.insertOne(application);

        if (result.insertedId) {
          res.status(201).send({ success: true, message: "Application submitted successfully!" });
        } else {
          throw new Error("Database insertion failed");
        }

      } catch (error) {
        console.error("Error submitting trainer application:", error);
        res.status(500).send({ success: false, message: "Failed to submit application. Please try again.", error });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}



run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('fitness tracker server is running')
})

app.listen(port, () => {
  console.log(`fitness tracker server is running on: ${port}`)
})