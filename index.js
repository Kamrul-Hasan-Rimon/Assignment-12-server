require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const morgan = require("morgan");
const { v4: uuidv4 } = require("uuid");
const port = process.env.PORT || 4000;
const app = express();

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://fitness-tracker-project-7cc0f.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const verifyAdmin = (req, res, next) => {
  if (req.user && req.user?.role === "admin") {
    console.log("Admin verified:", req.user);
    next();
  } else {
    return res
      .status(403)
      .send({ success: false, message: "Forbidden. Admin role required." });
  }
};
const verifyTrainer = (req, res, next) => {
  if (req.user && req.user?.role === "Trainer") {
    next();
  } else {
    return res
      .status(403)
      .send({ success: false, message: "Forbidden. Trainer role required." });
  }
};
const verifyMember = (req, res, next) => {
  if (req.user && req.user?.role === "member") {
    next();
  } else {
    return res
      .status(403)
      .send({ success: false, message: "Forbidden. Member role required." });
  }
};
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vtrz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    app.post("/jwt", async (req, res) => {
      let user = req.body;
      try {
        const dbUser = await usersCollection.findOne({ email: user.email });
        if (!dbUser) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        user = { email: user.email, role: dbUser.role || "member" }; 
        console.log("Creating JWT for:", user);
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "365d",
        });
        res.send({ success: true, token });
      } catch (error) {
        console.error("Error creating JWT:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to create token" });
      }
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("No token found in Authorization header");
        return res.status(401).send({ message: "unauthorized" });
      }

      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.log("Invalid token:", err);
          return res.status(401).send({ message: "unauthorized" });
        }
        req.user = decoded;
        next();
      });
    };
    async function logActivity({ email, description }) {
      if (!email || !description) return;
      await activityLogCollection.insertOne({
        email,
        description,
        timestamp: new Date(),
      });
    }

    app.post("/logout", (req, res) => {
      res.send({ success: true });
    });

    const trainnersCollection = client.db("TrainersDB").collection("trainers");
    const usersCollection = client.db("UsersDB").collection("users");
    const classesCollection = client.db("ClassesDB").collection("Classes");
    const bookingsCollection = client.db("BookingsDB").collection("Bookings");
    const paymentsCollection = client.db("PaymentsDB").collection("Payments");
    const activityLogCollection = client
      .db("ActivityLogDB")
      .collection("ActivityLog");

    const applyTrainerCollection = client
      .db("ApplyTrainerDB")
      .collection("ApplyTrainer");
    const reviewsCollection = client.db("ReviewsDB").collection("Reviews");
    const forumPostsCollection = client
      .db("ForumPostsDB")
      .collection("ForumPosts");
    const newsletterSubscribersCollection = client
      .db("NewsletterSubscribersDB")
      .collection("NewsletterSubscribers");

    // POST /users/:email — creates user if not exists
    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = req.body.email;

      try {
        const isExist = await usersCollection.findOne({ email });
        if (isExist) {
          return res
            .status(200)
            .send({ success: true, message: "User already exists" }); // Simplified response
        }

        const result = await usersCollection.insertOne({
          ...user,
          role: "member",
          timestamp: Date.now(),
        });

        res.status(201).send({
          success: true,
          message: "User data posted successfully.",
          result,
        });
      } catch (error) {
        console.error("Error creating user:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to create user" });
      }
    });

    // GET /users/:email — fetch user
    app.get("/users/:email", verifyToken, async (req, res) => {
      try {
        const { email } = req.params;

        if (!email) {
          return res
            .status(400)
            .send({ success: false, message: "Email is required" });
        }
        const requesterEmail = req.user.email;
        if (requesterEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden" });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }
        res.status(200).send({ success: true, data: user });
      } catch (error) {
        console.error("Error fetching user:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch user" });
      }
    });

    app.put("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const { role } = req.body;

        console.log("Received email:", email);
        console.log("Updating role to:", role);

        const user = await usersCollection.findOne({ email });
        console.log("User found:", user); 
        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        const updatedUser = await usersCollection.findOneAndUpdate(
          { email },
          { $set: { role } },
          { returnDocument: "after" }
        );

        res.status(200).send({
          success: true,
          message: "User role updated successfully",
          data: updatedUser.value,
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update user role" });
      }
    });

    app.get("/applytrainer", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const trainers = await applyTrainerCollection.find({}).toArray(); 
        console.log("Fetched applied trainers:", trainers);
        res.status(200).send(trainers);
      } catch (error) {
        console.error("Error fetching applied trainers:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Failed to fetch applied trainers",
        });
      }
    });

    app.post("/applytrainer", async (req, res) => {
      try {
        const application = req.body;
        const result = await applyTrainerCollection.insertOne(application);

        if (result.insertedId) {
          res.status(201).send({
            success: true,
            message: "Application submitted successfully!",
          });
        } else {
          throw new Error("Database insertion failed");
        }
      } catch (error) {
        console.error("Error submitting trainer application:", error);
        res.status(500).send({
          success: false,
          message: "Failed to submit application. Please try again.",
          error,
        });
      }
    });
    // Fetch Trainer Details by ID
    app.get("/applytrainer/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid ID format" });
        }

        const trainer = await applyTrainerCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!trainer) {
          return res
            .status(404)
            .send({ success: false, message: "Trainer not found" });
        }
        res.status(200).send({ success: true, data: trainer });
      } catch (error) {
        console.error("Error fetching trainer details:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch trainer details" });
      }
    });

    // Delete Trainer Application
    app.delete(
      "/applytrainer/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res
              .status(400)
              .send({ success: false, message: "Invalid ID format" });
          }

          const result = await applyTrainerCollection.deleteOne({
            _id: new ObjectId(id),
          });
          if (result.deletedCount === 0) {
            return res
              .status(404)
              .send({ success: false, message: "Trainer not found" });
          }
          res.status(200).send({
            success: true,
            message: "Trainer application deleted successfully",
          });
        } catch (error) {
          console.error("Error deleting trainer application:", error);
          res.status(500).send({
            success: false,
            message: "Failed to delete trainer application",
          });
        }
      }
    );
    app.post("/trainers", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const newTrainer = req.body;

        // Check if trainer data is missing or incomplete
        if (!newTrainer || !newTrainer.email) {
          return res
            .status(400)
            .json({ error: "Trainer data is missing or incomplete" });
        }

        const result = await trainnersCollection.insertOne(newTrainer);

        res.status(201).json({ message: "Trainer added successfully" });
      } catch (error) {
        console.error("Error adding trainer:", error);
        res
          .status(500)
          .json({ error: "An error occurred while adding the trainer" });
      }
    });

    // Existing endpoints
    app.get("/trainers", async (req, res) => {
      try {
        const result = await trainnersCollection.find({}).toArray();
        res.status(200).send({ success: true, result });
      } catch (error) {
        res
          .status(500)
          .send({ success: true, message: "Failed to fetch trainers", error });
      }
    });

    app.get("/trainers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const trainer = await trainnersCollection.findOne({ _id: id });
        if (!trainer) {
          return res.status(404).send({ message: "Trainer not found" });
        }
        res.status(200).send(trainer);
      } catch (error) {
        res.status(500).send({ message: "Error retrieving trainer", error });
      }
    });

    app.delete("/trainers/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      try {
        const result = await trainnersCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Trainer not found" });
        }
        res.status(200).send(result);
      } catch (err) {
        console.error("Error deleting trainer:", err);
        res.status(500).send({ message: "Failed to delete trainer" });
      }
    });

    app.get(
      "/trainer/booking",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        try {
          const trainerEmail = req.user.email;
          const result = await bookingsCollection
            .find({ trainerEmail: trainerEmail })
            .toArray(); 
          res.status(200).send(result);
        } catch (error) {
          res.status(500).send({ message: "Failed to fetch bookings", error });
        }
      }
    );
    app.delete(
      "/trainer/booking/:id",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res
              .status(400)
              .send({ success: false, message: "Invalid ID format" });
          }

          const result = await bookingsCollection.deleteOne({
            _id: new ObjectId(id),
          });
          if (result.deletedCount === 0) {
            return res
              .status(404)
              .send({ success: false, message: "Trainer not found" });
          }
          res.status(200).send({
            success: true,
            message: "Trainer application deleted successfully",
          });
        } catch (error) {
          console.error("Error deleting trainer application:", error);
          res.status(500).send({
            success: false,
            message: "Failed to delete trainer application",
          });
        }
      }
    );
    // POST /trainer/slots
    app.post("/trainer/slots", verifyToken, verifyTrainer, async (req, res) => {
      try {
        const trainerEmail = req.user.email; // Get trainer ID from JWT
        const { days, slotName, slotTime } = req.body;

        if (!days || !slotName || !slotTime) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const trainer = await trainnersCollection.findOne({
          email: trainerEmail,
        });
        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        const newSlot = {
          slotId: uuidv4(), 
          slotName,
          slotTime,
          isBooked: false,
          daysAvailable: days,
        };

        const result = await trainnersCollection.updateOne(
          { email: trainerEmail },
          { $push: { availableSlots: newSlot } }
        );

        res.status(201).json({ result, message: "Slot created successfully" });
      } catch (error) {
        console.error("Error creating slot:", error);
        res.status(500).json({ message: "Failed to create slot" });
      }
    });

    app.get(
      "/slots/trainer/:email",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        try {
          const trainerEmail = req.params.email;
          const userEmail = req.user.email; 
          if (userEmail !== trainerEmail) {
            return res
              .status(403)
              .send({ success: false, message: "Forbidden" });
          }
          const trainer = await trainnersCollection.findOne({
            email: trainerEmail,
          });

          if (!trainer) {
            return res.status(404).json({ message: "Trainer not found" });
          }

          const slots = trainer.availableSlots;
          console.log("Fetched slots for trainer:", trainerEmail, slots);
          res.status(200).json({ success: true, data: slots });
        } catch (error) {
          console.error("Error fetching slots:", error);
          res.status(500).json({
            success: false,
            message: "Failed to fetch slots.",
            error: error.message,
          });
        }
      }
    );
    app.delete(
      "/slots/:slotId",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        try {
          const trainerEmail = req.user.email; 
          const slotId = req.params.slotId; 

          // Validate slotId (very important)
          if (!slotId || typeof slotId !== "string") {
            return res.status(400).json({ message: "Invalid slotId" });
          }

          const trainer = await trainnersCollection.findOne(
            { email: trainerEmail, "availableSlots.slotId": slotId }
          );

          if (!trainer) {
            return res
              .status(404)
              .json({ message: "Trainer or Slot not found" });
          }
          console.log("Trainer availableSlots:", trainer.availableSlots);

          const result = await trainnersCollection.updateOne(
            { email: trainerEmail },
            { $pull: { availableSlots: { slotId: slotId } } } 
          );

          console.log("Update Result:", result);

          if (result.modifiedCount === 0) {
            return res
              .status(404)
              .json({ message: "Slot not found or could not be deleted" });
          }

          res.status(200).json({ message: "Slot deleted successfully" });
        } catch (error) {
          console.error("Error deleting slot:", error);
          res.status(500).json({ message: "Failed to delete slot" });
        }
      }
    );

    app.post("/classes", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { name, description } = req.body;

        if (!name || !description) {
          return res
            .status(400)
            .json({ message: "Class name and description are required." });
        }
        const result = await classesCollection.insertOne({ name, description });
        res.status(201).json({
          classId: result.insertedId,
          message: "Class added successfully.",
        });
      } catch {
        res
          .status(500)
          .json({ message: "An error occurred while adding the class." });
      }
    });

    app.get("/classes", async (req, res) => {
      try {
        const result = await classesCollection.find({}).toArray();
        res.status(200).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch classes data", error });
      }
    });
    // New DELETE /classes/:id endpoint
    app.delete("/classes/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const classId = req.params.id;
        const result = await classesCollection.deleteOne({
          _id: new ObjectId(classId),
        });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Class not found." });
        }
        console.log("Class deleted:", { classId });
        res
          .status(200)
          .json({ success: true, message: "Class deleted successfully." });
      } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).json({
          success: false,
          message: "An error occurred while deleting the class.",
          error: error.message,
        });
      }
    });

    app.get("/forum/posts", verifyToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 6;
        const skip = (page - 1) * limit;

        const totalPosts = await forumPostsCollection.countDocuments({});

        const posts = await forumPostsCollection
          .aggregate([
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "username", 
                as: "user",
              },
            },
            {
              $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                title: 1,
                content: 1,
                createdAt: 1,
                upvotes: { $ifNull: ["$upvotes", 0] },
                downvotes: { $ifNull: ["$downvotes", 0] },
                authorName: "$user.name", 
                author: 1, 
              },
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
          ])
          .toArray();
        const totalPages = Math.ceil(totalPosts / limit);

        res.send({ success: true, posts, totalPages });
      } catch (error) {
        console.error("Error fetching posts:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch posts." });
      }
    });
    app.post("/forum/posts", verifyToken, async (req, res) => {
      try {
        const userId = req.user.userId; 
        const { title, content } = req.body;

        if (!title || !content) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const newPost = {
          userId: new ObjectId(userId),
          title,
          content,
          createdAt: new Date(),
          upvotes: 0,
          downvotes: 0,
          voters: [],
        };

        const result = await forumPostsCollection.insertOne(newPost);

        res.status(201).json({ message: "Post created successfully" });
      } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ message: "Failed to create post" });
      }
    });
    app.post("/forum/posts/:postId/vote", verifyToken, async (req, res) => {
      try {
        const { postId } = req.params;
        const { email, vote } = req.body;

        if (!ObjectId.isValid(postId)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid post ID." });
        }
        if (!isValidEmail(email)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid email format." });
        }
        if (typeof vote !== "number" || (vote !== 1 && vote !== -1)) {
          return res.status(400).send({
            success: false,
            message: "Invalid vote value. Must be 1 or -1.",
          });
        }

        const post = await forumPostsCollection.findOne({
          _id: new ObjectId(postId),
        });

        if (!post) {
          return res
            .status(404)
            .send({ success: false, message: "Post not found." });
        }

        let updatedPost;
        const existingVote = post.voters.find((voter) => voter.email === email);

        if (existingVote) {
          updatedPost = await forumPostsCollection.updateOne(
            { _id: new ObjectId(postId) },
            {
              $pull: { voters: { email } },
              $inc: { upvotes: -existingVote.vote },
            }
          );
        }

        if (vote !== 0) {
          updatedPost = await forumPostsCollection.updateOne(
            { _id: new ObjectId(postId) },
            {
              $push: { voters: { email, vote } },
              $inc: { upvotes: vote },
            }
          );
        }

        res.send({ success: true, message: "Vote updated successfully." });
      } catch (error) {
        console.error("Error updating vote:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update vote." });
      }
    });

    // Function to validate email format
    function isValidEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    app.post("/subscribe", async (req, res) => {
      try {
        const { name, email, subscribedAt } = req.body;

        const existingSubscriber =
          await newsletterSubscribersCollection.findOne({ email });
        if (existingSubscriber) {
          return res.json({
            success: false,
            message: "Email already subscribed",
          });
        }
        const result = await newsletterSubscribersCollection.insertOne({
          name,
          email,
          subscribedAt,
        });
        res.send({
          success: true,
          message: "Subscriber data posted successfully.",
          result,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to post newsletter." });
      }
    });

    app.get("/subscribe", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await newsletterSubscribersCollection.find({}).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch subscribers", error });
      }
    });
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount, bookingId } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // Convert to cents and ensure it's an integer
          currency: "usd",
          payment_method_types: ["card"],
        });

        // Save payment intent to database
        const paymentData = {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          bookingId,
          createdAt: new Date(),
        };

        await paymentsCollection.insertOne(paymentData);

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: error.message });
      }
    });
    app.post("/trainer/booking", async (req, res) => {
      try {
        const bookingData = req.body;

        // Validate booking data
        if (
          !bookingData ||
          !bookingData.price ||
          !bookingData.userEmail ||
          !bookingData.paymentId
        ) {
          return res.status(400).json({ error: "Invalid booking data" });
        }

        // Add booking date if not provided
        if (!bookingData.bookingDate) {
          bookingData.bookingDate = new Date();
        }

        // Insert booking into the database
        const result = await bookingsCollection.insertOne(bookingData);

        if (result.insertedId) {
          res.status(201).json({ insertedId: result.insertedId });
        } else {
          throw new Error("Failed to save booking details");
        }
      } catch (error) {
        console.error("Error saving booking:", error);
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/admin/balance", verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Fetch all bookings and payments
        const bookings = await bookingsCollection.find({}).toArray();
        const payments = await paymentsCollection.find({}).toArray();

        // Calculate total balance
        const totalBalance = payments.reduce(
          (sum, payment) => sum + payment.amount,
          0
        );

        // Prepare recent transactions
        const recentTransactions = bookings
          .map((booking) => ({
            memberName: booking.userName,
            amount: booking.price,
            date: booking.bookingDate,
          }))
          .slice(0, 10);

        // Calculate total subscribers
        const totalSubscribers =
          await newsletterSubscribersCollection.countDocuments();

        // Calculate total paid members
        const totalPaidMembers = await bookingsCollection
          .aggregate([
            { $group: { _id: "$userEmail" } },
            { $count: "totalPaidMembers" },
          ])
          .toArray();

        const totalPaidMembersCount =
          totalPaidMembers[0]?.totalPaidMembers || 0;

        res.send({
          totalBalance,
          recentTransactions,
          totalSubscribers,
          totalPaidMembers: totalPaidMembersCount,
        });
      } catch (error) {
        console.error("Error fetching balance data:", error);
        res.status(500).json({ error: "Failed to fetch balance data" });
      }
    });
    app.put("/users/profile", async (req, res) => {
      try {
        const { email, name, profilePicture } = req.body;
        const result = await usersCollection.updateOne(
          { email },
          { $set: { name, image: profilePicture } }
        );
        await logActivity({
          email,
          description: "Updated profile information.",
        });
        res.send({ success: true, message: "Profile updated.", result });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to update profile." });
      }
    });

    // GET /activity-log/:email — fetch user activity log
    app.get("/activity-log/:email", async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) {
          return res
            .status(400)
            .json({ success: false, message: "Email is required." });
        }
        const activities = await activityLogCollection
          .find({ email })
          .limit(50)
          .toArray();
        res.json({ success: true, activities });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch activity log." });
      }
    });
    // ...existing code...

    // GET /bookings/member/:email - Get all bookings for a member with trainer info
    app.get("/bookings/member/:email", async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) {
          return res
            .status(400)
            .json({ success: false, message: "Email is required." });
        }

        // Find bookings for this member
        const bookings = await bookingsCollection
          .find({ userEmail: email })
          .toArray();

        // For each booking, populate trainer info
        const bookingsWithTrainer = await Promise.all(
          bookings.map(async (booking) => {
            let trainer = null;
            if (booking.trainerId) {
              // Make sure to use ObjectId if trainerId is stored as ObjectId
              try {
                trainer = await trainnersCollection.findOne({
                  _id: new ObjectId(booking.trainerId),
                });
              } catch {
                trainer = null;
              }
            }
            return {
              ...booking,
              trainer,
            };
          })
        );

        res.json({ success: true, bookings: bookingsWithTrainer });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch booked trainers.",
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Fitness tracker server is running");
});

app.listen(port, () => {
  console.log(`Fitness tracker server is running on: ${port} `);
});
