import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import calculationsRouter from "./routes/calculations.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;
const host = process.env.HOST || "127.0.0.1";

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "transport-break-even-engine",
    databaseConfigured: Boolean(process.env.DATABASE_URL)
  });
});

app.use("/api", calculationsRouter);

app.get("/", (req, res) => {
  res.send("transport break-even engine backend is running");
});

app.listen(port, host, () => {
  console.log(
    `transport break-even engine backend listening on http://${host}:${port}`
  );
});
