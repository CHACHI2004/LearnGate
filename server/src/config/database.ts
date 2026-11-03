import mongoose from "mongoose";
import { env } from "./env.js";
import * as models from "../models/index.js";

export async function connectDatabase() {
  mongoose.set("autoCreate", true);
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DATABASE,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 10_000,
    waitQueueTimeoutMS: 5_000,
  });
  await Promise.all(Object.values(models).map((model) => model.init()));
  console.info(`LearnGate database ready: ${env.MONGODB_DATABASE}`);
}
