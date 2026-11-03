import mongoose from "mongoose";
import { env } from "../config/env.js";
import { AiGenerationLogModel } from "../models/ai-generation-log.model.js";

export type GenerationStatus = "succeeded" | "failed" | "exhausted";

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function reserveMonthlyGeneration(userId: mongoose.Types.ObjectId) {
  const month = monthKey();
  await AiGenerationLogModel.updateOne(
    { userId, month },
    { $setOnInsert: { count: 0, status: "ready" } },
    { upsert: true },
  );
  const usage = await AiGenerationLogModel.findOneAndUpdate(
    { userId, month, count: { $lt: env.AI_MONTHLY_GENERATION_CAP } },
    { $inc: { count: 1 }, $set: { status: "generating" } },
    { new: true },
  ).lean();
  return usage ? { month, used: usage.count, limit: env.AI_MONTHLY_GENERATION_CAP } : null;
}

export async function refundMonthlyGeneration(userId: mongoose.Types.ObjectId, month: string) {
  await AiGenerationLogModel.updateOne(
    { userId, month },
    { $inc: { count: -1 }, $set: { status: "ready" } },
  );
}

export async function setGenerationStatus(
  userId: mongoose.Types.ObjectId,
  status: GenerationStatus,
  month = monthKey(),
) {
  await AiGenerationLogModel.updateOne({ userId, month }, { $set: { status } });
}

export async function readMonthlyGenerationQuota(userId: mongoose.Types.ObjectId, month = monthKey()) {
  const usage = await AiGenerationLogModel.findOne({ userId, month }).select("count").lean();
  const used = usage?.count ?? 0;
  return {
    used,
    limit: env.AI_MONTHLY_GENERATION_CAP,
    remaining: Math.max(0, env.AI_MONTHLY_GENERATION_CAP - used),
  };
}
