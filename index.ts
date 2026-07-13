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
      videoUrl,
      ispName,
    } = req.body;

    if (
      !utilityType ||
      !area ||
      !district ||
      !shortDescription ||
      !description ||
      !reporterId ||
      !reporterName
    ) {
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
      status: "active",
      startedAt: startedAt || new Date().toISOString(),
      shortDescription,
      description,
      image: image || null,
      videoUrl: videoUrl || null,
      ispName: utilityType === "internet" ? ispName || null : null,
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

app.get("/api/reports", async (req: Request, res: Response) => {
  try {
    const { district, area, utilityType, sortBy = "newest", status, startDate, endDate, q, page = "1", limit = "12" } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};
    if (district) query.district = district;
    if (area) query.area = area;
    if (utilityType) query.utilityType = utilityType;
    if (status && status !== "all") query.status = status;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }
    
    if (q) {
      const searchRegex = { $regex: q as string, $options: "i" };
      query.$or = [
        { area: searchRegex },
        { district: searchRegex },
        { shortDescription: searchRegex },
        { description: searchRegex }
      ];
    }

    const total = await reports.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum);

    let sortOption: any = { createdAt: -1 };
    if (sortBy === "most_upvoted") {
      const pipeline: any[] = [
        { $match: query },
        {
          $addFields: {
            upvotesCount: { $size: { $ifNull: ["$upvotes", []] } },
          },
        },
        { $sort: { upvotesCount: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        { $project: { upvotesCount: 0 } },
      ];

      const results = await reports.aggregate(pipeline).toArray();
      res.status(200).json({ reports: results, totalPages, currentPage: pageNum, total });
      return;
    }

    const results = await reports.find(query).sort(sortOption).skip(skip).limit(limitNum).toArray();
    res.status(200).json({ reports: results, totalPages, currentPage: pageNum, total });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/reports/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid ID format" });
      return;
    }

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    res.status(200).json(report);
  } catch (error) {
    console.error("Error fetching report by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/reports/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, status } = req.body;

    if (!ObjectId.isValid(id) || !userId || !status) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.reporterId !== userId) {
      res.status(403).json({ error: "Only the reporter can update the status" });
      return;
    }

    const validStatuses = ["active", "resolved"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    await reports.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    const updated = await reports.findOne({ _id: new ObjectId(id) });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/reports/:id/vote", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, voteType } = req.body;

    if (!ObjectId.isValid(id) || !userId || !voteType) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const arrayMap: Record<string, string> = { upvote: "upvotes", downvote: "downvotes", resolved: "resolvedVotes" };
    const target = arrayMap[voteType];
    
    if (!target) {
      res.status(400).json({ error: "Invalid vote type" });
      return;
    }

    const hasVoted = report[target]?.includes(userId);
    const pullFields: any = {};
    Object.values(arrayMap).forEach((arr: string) => {
      if (arr !== target) pullFields[arr] = userId;
    });

    if (hasVoted) {
      // Toggle off
      pullFields[target] = userId;
      await reports.updateOne({ _id: new ObjectId(id) }, { $pull: pullFields });
    } else {
      // Toggle on: remove from others, add to target
      if (Object.keys(pullFields).length > 0) {
        await reports.updateOne({ _id: new ObjectId(id) }, { $pull: pullFields });
      }
      await reports.updateOne({ _id: new ObjectId(id) }, { $addToSet: { [target]: userId } });
    }

    const updated = await reports.findOne({ _id: new ObjectId(id) });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error voting:", error);
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
