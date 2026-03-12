import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export async function uploadImage(
  file: Buffer,
  fileName: string,
  contentType: string,
) {
  const bucketName = process.env.R2_BUCKET_NAME || "";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: file,
    ContentType: contentType,
  });

  try {
    await r2.send(command);
    // Return the public URL
    return `${publicUrl}/${fileName}`;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload image to R2");
  }
}

export async function deleteImage(imageUrl: string) {
  const bucketName = process.env.R2_BUCKET_NAME || "";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  // Extract filename from URL
  if (!imageUrl.startsWith(publicUrl)) {
    console.warn("Image URL does not match R2 public URL, skipping delete");
    return;
  }

  const fileName = imageUrl.replace(`${publicUrl}/`, "");

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  try {
    await r2.send(command);
    console.log(`Deleted image: ${fileName}`);
  } catch (error) {
    console.error("Error deleting from R2:", error);
    // Don't throw - deletion failures shouldn't break the user flow
  }
}
