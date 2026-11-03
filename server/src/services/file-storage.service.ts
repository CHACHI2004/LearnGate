import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import { getCloudinary } from "../config/cloudinary.js";

export type StoredFile = {
  databaseFileId: mongoose.Types.ObjectId;
  url: string;
  publicId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  resourceType: "image" | "video" | "raw";
  deliveryType: "upload" | "authenticated";
};

type StoreFileInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder: string;
  resourceType: StoredFile["resourceType"];
  authenticated?: boolean;
};

export async function storeFileInBoth(input: StoreFileInput): Promise<StoredFile> {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected; the uploaded file cannot be stored.");

  const cloudinary = getCloudinary();
  const cloudUpload = new Promise<{ secure_url: string; public_id: string; bytes: number }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: input.resourceType,
        folder: input.folder,
        ...(input.authenticated ? { access_mode: "authenticated" as const } : {}),
      },
      (error, uploaded) => {
        if (error) reject(error);
        else if (!uploaded?.secure_url || !uploaded.public_id) reject(new Error("Cloudinary returned incomplete upload metadata."));
        else resolve(uploaded);
      },
    );
    stream.end(input.buffer);
  });

  const uploaded = await cloudUpload;
  const deliveryType = input.authenticated ? "authenticated" : "upload";
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: "uploads" });
  const uploadStream = bucket.openUploadStream(input.fileName, {
    metadata: {
      contentType: input.mimeType,
      originalName: input.fileName,
      cloudinaryPublicId: uploaded.public_id,
    },
  });
  try {
    await pipeline(Readable.from([input.buffer]), uploadStream);
    return {
      databaseFileId: uploadStream.id,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: uploaded.bytes,
      resourceType: input.resourceType,
      deliveryType,
    };
  } catch (error) {
    const abortResult = await Promise.allSettled([uploadStream.abort()]);
    const cleanupFailures = abortResult.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (cleanupFailures.length) {
      const deleteResult = await Promise.allSettled([bucket.delete(uploadStream.id)]);
      cleanupFailures.push(...deleteResult.flatMap((result) => result.status === "rejected" ? [result.reason] : []));
    }
    if (cleanupFailures.length) console.error("Could not remove a partial GridFS upload:", cleanupFailures);
    try {
      await deleteCloudinaryFile(uploaded.public_id, input.resourceType, deliveryType);
    } catch (cleanupError) {
      console.error("Could not remove the Cloudinary copy after a GridFS upload failed:", cleanupError);
    }
    throw error;
  }
}

export async function deleteDatabaseFile(databaseFileId: mongoose.Types.ObjectId | string) {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected; the stored file cannot be deleted.");
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: "uploads" });
  await bucket.delete(typeof databaseFileId === "string"
    ? new mongoose.mongo.ObjectId(databaseFileId)
    : databaseFileId);
}

export async function deleteCloudinaryFile(
  publicId: string,
  resourceType: StoredFile["resourceType"],
  deliveryType: StoredFile["deliveryType"],
) {
  await getCloudinary().uploader.destroy(publicId, { resource_type: resourceType, type: deliveryType });
}

export async function deleteStoredFile(file: Pick<StoredFile, "databaseFileId" | "publicId" | "resourceType" | "deliveryType">) {
  const results = await Promise.allSettled([
    deleteDatabaseFile(file.databaseFileId),
    deleteCloudinaryFile(file.publicId, file.resourceType, file.deliveryType),
  ]);
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (failures.length) {
    console.error("Could not remove all copies of an uploaded file:", failures);
  }
}
