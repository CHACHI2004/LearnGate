import type { Types } from "mongoose";
import type { User } from "../models/user.model.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: Types.ObjectId;
        role: User["role"];
        isAdmin: boolean;
      };
    }
  }
}

export {};
