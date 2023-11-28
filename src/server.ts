import express from "express";
import { smartBot } from "./bot";

const app = express();
const port = 8000;

app.use(express.json());

app.post('/', (req, res) => {
  res.json(smartBot(req.body));
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
});
