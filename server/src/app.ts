import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import subjectRoutes from "./routes/subject.routes.js";
import topicRoutes from "./routes/topic.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import quizRoutes from "./routes/quiz.routes.js";
import reportRoutes from "./routes/report.routes.js";
import flashcardRoutes from "./routes/flashcard.routes.js";
import { asyncHandler } from "./utils/async-handler.js";
import { UserModel } from "./models/user.model.js";

export const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || env.CLIENT_ORIGINS.includes(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && !env.CLIENT_ORIGINS.includes(origin)) {
      response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" } });
      return;
  }
  next();
});

app.get(`${env.API_PREFIX}/health`, (_request, response) => {
  response.status(200).json({ status: "ok", service: "learngate-api" });
});

app.get(`${env.API_PREFIX}/health/ready`, asyncHandler(async (_request, response) => {
  const database = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !database) {
    response.status(503).json({ status: "not_ready", service: "learngate-api", database: "disconnected" });
    return;
  }
  await database.admin().ping();
  await UserModel.findOne().select("_id").maxTimeMS(5_000).lean();
  response.status(200).json({ status: "ok", service: "learngate-api", database: "readable" });
}));

app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/subjects`, subjectRoutes);
app.use(`${env.API_PREFIX}/topics`, topicRoutes);
app.use(`${env.API_PREFIX}/users`, userRoutes);
app.use(`${env.API_PREFIX}/admin`, adminRoutes);
app.use(`${env.API_PREFIX}/uploads`, uploadRoutes);
app.use(`${env.API_PREFIX}/quizzes`, quizRoutes);
app.use(`${env.API_PREFIX}/reports`, reportRoutes);
app.use(`${env.API_PREFIX}/flashcards`, flashcardRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
