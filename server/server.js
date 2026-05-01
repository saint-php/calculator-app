import express from "express";
import cors from "cors";
import { evaluate } from "mathjs";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/solve", (req, res) => {
  try {
    const { expression } = req.body;
    const result = evaluate(expression);
    res.json({ result });
  } catch {
    res.status(400).json({ error: "Invalid expression" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});