/**
 * Photo upload settings (Cloudinary — free plan is enough).
 *
 * These two values are NOT secrets, so it is fine to keep them in the code.
 *   1. Create a free account at cloudinary.com
 *   2. Copy your "Cloud name" from the dashboard  -> CLOUDINARY_CLOUD_NAME
 *   3. Settings > Upload > "Add upload preset", set Signing mode to
 *      "Unsigned", save, and copy its name        -> CLOUDINARY_UPLOAD_PRESET
 *
 * Leave both empty and the dashboard still works: owners can paste an
 * https image link instead of uploading a file.
 */
export const CLOUDINARY_CLOUD_NAME = 'u5ptnnrh'
export const CLOUDINARY_UPLOAD_PRESET = 'qdez2wvt'
