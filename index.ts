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
      reporterImage,
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
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      shortDescription,
      description,
      image: image || null,
      videoUrl: videoUrl || null,
      ispName: utilityType === "internet" ? ispName || null : null,
      reporterId,
      reporterName,
      reporterImage: reporterImage || null,
      createdAt: new Date(),
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
    if (req.query.reporterId) query.reporterId = req.query.reporterId;
    
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
app.get("/api/reports/safety-stats", async (req: Request, res: Response) => {
  try {
    const { type = "districts", q, utilityType, district, page = "1", limit = "12" } = req.query;
    
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    const initialMatch: any = {};
    if (utilityType && utilityType !== "all") {
      initialMatch.utilityType = utilityType;
    }

    const groupStage = {
      $group: {
        _id: type === "districts" ? "$district" : { district: "$district", area: "$area" },
        totalReports: { $sum: 1 },
        activeReports: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        resolvedReports: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
        activeElectricity: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$utilityType", "electricity"] }] }, 1, 0] } },
        activeWater: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$utilityType", "water"] }] }, 1, 0] } },
        activeGas: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$utilityType", "gas"] }] }, 1, 0] } },
        activeInternet: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$utilityType", "internet"] }] }, 1, 0] } }
      }
    };

    const addScoreStage = {
      $addFields: {
        score: {
          $cond: [
            { $eq: ["$totalReports", 0] },
            100,
            {
              $round: [
                { $subtract: [100, { $multiply: [{ $divide: ["$activeReports", "$totalReports"] }, 100] }] },
                0
              ]
            }
          ]
        }
      }
    };
    
    const addSafetyLevelStage = {
      $addFields: {
        safetyLevel: {
          $switch: {
            branches: [
              { case: { $lt: ["$score", 50] }, then: "Avoid" },
              { case: { $lt: ["$score", 80] }, then: "Caution" }
            ],
            default: "Safe"
          }
        }
      }
    };

    const searchMatchStage: any = {};
    if (district && type === "areas") {
      searchMatchStage["_id.district"] = district;
    }

    if (q) {
      const searchRegex = { $regex: q as string, $options: "i" };
      if (type === "districts") {
        searchMatchStage["_id"] = searchRegex;
      } else {
        searchMatchStage["$or"] = [
          { "_id.district": searchRegex },
          { "_id.area": searchRegex }
        ];
      }
    }

    const formatStage = {
      $project: {
        _id: 0,
        district: type === "districts" ? "$_id" : "$_id.district",
        area: type === "districts" ? "$$REMOVE" : "$_id.area",
        name: type === "districts" ? "$_id" : "$_id.area",
        totalReports: 1,
        activeReports: 1,
        resolvedReports: 1,
        score: 1,
        safetyLevel: 1,
        activeUtilities: {
          electricity: "$activeElectricity",
          water: "$activeWater",
          gas: "$activeGas",
          internet: "$activeInternet"
        }
      }
    };

    const pipeline: any[] = [];
    if (Object.keys(initialMatch).length > 0) pipeline.push({ $match: initialMatch });
    pipeline.push(groupStage);
    pipeline.push(addScoreStage);
    pipeline.push(addSafetyLevelStage);
    if (Object.keys(searchMatchStage).length > 0) pipeline.push({ $match: searchMatchStage });

    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: { score: -1, activeReports: -1 } },
          { $skip: skip },
          { $limit: limitNum },
          formatStage
        ],
        overview: [
          {
            $group: {
              _id: null,
              safeCount: { $sum: { $cond: [{ $gte: ["$score", 80] }, 1, 0] } },
              activeCount: { $sum: { $cond: [{ $gt: ["$activeReports", 0] }, 1, 0] } },
              activeOutages: { $sum: "$activeReports" }
            }
          }
        ]
      }
    });

    const results = await reports.aggregate(pipeline).toArray();
    
    const total = results[0].metadata[0]?.total || 0;
    const statsData = results[0].data;
    const totalPages = Math.ceil(total / limitNum);

    let overview = { safeCount: 0, activeCount: 0, activeOutages: 0 };
    if (results[0].overview[0]) {
      overview = {
        safeCount: results[0].overview[0].safeCount,
        activeCount: results[0].overview[0].activeCount,
        activeOutages: results[0].overview[0].activeOutages
      };
    }

    res.status(200).json({ 
      stats: statsData, 
      totalPages, 
      currentPage: pageNum, 
      total,
      overview 
    });
  } catch (error) {
    console.error("Error fetching safety stats:", error);
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

app.delete("/api/reports/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // or req.query depending on how it's sent. Let's use req.body.

    if (!ObjectId.isValid(id) || !userId) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.reporterId !== userId) {
      res.status(403).json({ error: "Only the reporter can delete this report" });
      return;
    }

    await reports.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({ success: true, message: "Report deleted successfully" });
  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/reports/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, shortDescription, description, image, videoUrl, status } = req.body;

    if (!ObjectId.isValid(id) || !userId) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.reporterId !== userId) {
      res.status(403).json({ error: "Only the reporter can update this report" });
      return;
    }

    const updateFields: any = {};
    if (shortDescription !== undefined) updateFields.shortDescription = shortDescription;
    if (description !== undefined) updateFields.description = description;
    if (image !== undefined) updateFields.image = image;
    if (videoUrl !== undefined) updateFields.videoUrl = videoUrl;
    if (status !== undefined) updateFields.status = status;

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    await reports.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updated = await reports.findOne({ _id: new ObjectId(id) });
    res.status(200).json({ success: true, report: updated });
  } catch (error) {
    console.error("Error updating report:", error);
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
