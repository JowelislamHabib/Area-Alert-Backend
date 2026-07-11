import express, { type Express, type Request, type Response } from "express";

const app: Express = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const uri = process.env.MONGODB_URI;
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.post("/api/reports", async (req: Request, res: Response) => {
  try {
    const {
      utilityType,
      area,
      district,
      shortDescription,
      description,
      reporterId,
      reporterName,
      startedAt,
      image,
      ispName,
    } = req.body;

    if (!utilityType || !area || !district || !shortDescription || !description || !reporterId || !reporterName) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const validUtilityTypes = ["electricity", "internet", "water", "gas"];
    if (!validUtilityTypes.includes(utilityType)) {
      res.status(400).json({ error: "Invalid utilityType" });
      return;
    }

    const doc = {
      utilityType,
      area,
      district,
      status: "pending",
      startedAt: startedAt || new Date().toISOString(),
      shortDescription,
      description,
      image: image || null,
      ispName: utilityType === "internet" ? (ispName || null) : null,
      reporterId,
      reporterName,
      createdAt: new Date().toISOString(),
      upvotes: [],
      downvotes: [],
      resolvedVotes: [],
    };

    const result = await reports.insertOne(doc);

    res.status(201).json({ ...doc, _id: result.insertedId.toString() });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("AreaAlert");
const reports = db.collection("reports");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});


