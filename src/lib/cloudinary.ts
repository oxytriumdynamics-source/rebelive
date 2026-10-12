import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';

// Configure Cloudinary
if (env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: env.CLOUDINARY_URL,
  });
} else if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface CloudinaryUploadResult {
  url: string;
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

/**
 * Checks if Cloudinary is fully configured with valid credentials
 */
export function isCloudinaryConfigured(): boolean {
  if (env.CLOUDINARY_URL && env.CLOUDINARY_URL.length > 10) return true;
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
  );
}

/**
 * Uploads an image buffer or base64 string to Cloudinary.
 * If credentials are not set, provides a safe fallback placeholder.
 */
export async function uploadToCloudinary(
  fileSource: string | Buffer,
  options?: {
    folder?: string;
    publicId?: string;
    transformation?: any[];
  }
): Promise<CloudinaryUploadResult> {
  const folder = options?.folder || 'rebelive/products';

  if (!isCloudinaryConfigured()) {
    console.warn(
      '⚠️ Cloudinary credentials are not set in environment. Returning fallback asset path.'
    );
    // If it is a base64 string or buffer, return a valid usable path
    const fallbackId = `rbl-asset-${Date.now().toString().slice(-6)}`;
    return {
      url: typeof fileSource === 'string' && fileSource.startsWith('http')
        ? fileSource
        : '/products/apex.webp',
      secure_url: typeof fileSource === 'string' && fileSource.startsWith('http')
        ? fileSource
        : '/products/apex.webp',
      public_id: `${folder}/${fallbackId}`,
      width: 800,
      height: 1000,
      format: 'webp',
    };
  }

  const defaultTransformation = folder.includes('testimonials')
    ? [
        { width: 1000, height: 1000, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
      ]
    : [
        { width: 1600, height: 1600, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
      ];

  // Upload Buffer via upload_stream
  if (Buffer.isBuffer(fileSource)) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: options?.publicId,
          resource_type: 'image',
          transformation: options?.transformation || defaultTransformation,
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error('Cloudinary upload stream failed'));
          }
          resolve({
            url: result.url,
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
      uploadStream.end(fileSource);
    });
  }

  // Upload base64 data URI or remote image URL
  const uploadRes: UploadApiResponse = await cloudinary.uploader.upload(fileSource, {
    folder,
    public_id: options?.publicId,
    resource_type: 'image',
    transformation: options?.transformation || defaultTransformation,
  });

  return {
    url: uploadRes.url,
    secure_url: uploadRes.secure_url,
    public_id: uploadRes.public_id,
    width: uploadRes.width,
    height: uploadRes.height,
    format: uploadRes.format,
    bytes: uploadRes.bytes,
  };
}

/**
 * Deletes an image from Cloudinary by public ID
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) return true;
  try {
    const res = await cloudinary.uploader.destroy(publicId);
    return res.result === 'ok';
  } catch (err) {
    console.warn(`Failed to delete Cloudinary asset ${publicId}:`, err);
    return false;
  }
}

export { cloudinary };
