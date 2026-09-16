// Car With Driver India
// Secure Partner Application API
// Private Supabase Storage
// No documents are attached to email

export const config = {
  runtime: "edge",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET_NAME = "partner-documents";

// Keep total website upload below Vercel request limit
const MAX_TOTAL_SIZE = 4 * 1024 * 1024; // 4 MB
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB per file
const MAX_VEHICLE_PHOTOS = 4;

const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function cleanFileName(name) {
  return String(name || "document")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
}

async function uploadToSupabase(file, path) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Invalid file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `${file.name || "File"} is larger than 3 MB.`
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type":
          file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: await file.arrayBuffer(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Document upload failed: ${errorText}`
    );
  }

  return path;
}

async function deleteUploadedFile(path) {
  if (!path) return;

  try {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}`,
      {
        method: "DELETE",
        headers: {
          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prefixes: [path],
        }),
      }
    );
  } catch (error) {
    console.error(
      "Failed to delete uploaded file:",
      error
    );
  }
}

async function saveApplication(application) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/partner_applications`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(application),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Database save failed: ${errorText}`
    );
  }

  return response.json();
}

async function sendNotificationEmail(application) {
  const accessKey =
    process.env.WEB3FORMS_ACCESS_KEY;

  if (!accessKey) {
    console.error(
      "WEB3FORMS_ACCESS_KEY is missing."
    );
    return;
  }

  const message = `
New Partner Application

Name: ${application.name}
Mobile: ${application.phone}
Email: ${application.email || "Not provided"}
Alternate Number: ${
    application.alternate_phone || "Not provided"
  }

Vehicle Details
Brand: ${application.car_brand || "Not provided"}
Model: ${application.car_model || "Not provided"}
Manufacturing Year: ${
    application.mfg_year || "Not provided"
  }

Documents:
All required documents have been uploaded successfully.

Storage:
Private Supabase Storage

IMPORTANT:
No documents are attached to this email.
`;

  try {
    const response = await fetch(
      "https://api.web3forms.com/submit",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: accessKey,
          subject:
            `New Partner Application - ${application.name}`,
          from_name: "CWD Partner System",
          message,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Web3Forms email failed:",
        await response.text()
      );
    }
  } catch (error) {
    console.error(
      "Email notification error:",
      error
    );
  }
}

export default async function handler(request) {

  // CORS preflight
  if (request.method === "OPTIONS") {
    return jsonResponse({
      success: true,
    });
  }

  // Only POST allowed
  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        message:
          "Only POST requests are allowed.",
      },
      405
    );
  }

  // Check environment variables
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "Supabase environment variables are missing."
    );

    return jsonResponse(
      {
        success: false,
        message:
          "Server configuration error.",
      },
      500
    );
  }

  const uploadedFiles = [];

  try {

    const formData =
      await request.formData();

    // ----------------------------------------
    // PARTNER DETAILS
    // ----------------------------------------

    const name =
      String(
        formData.get("name") || ""
      ).trim();

    const phone =
      String(
        formData.get("phone") || ""
      ).trim();

    const email =
      String(
        formData.get("email") || ""
      ).trim();

    const alternatePhone =
      String(
        formData.get("alternate_phone") || ""
      ).trim();

    const carBrand =
      String(
        formData.get("car_brand") || ""
      ).trim();

    const carModel =
      String(
        formData.get("car_model") || ""
      ).trim();

    const mfgYearRaw =
      String(
        formData.get("mfg_year") || ""
      ).trim();

    const mfgYear =
      mfgYearRaw
        ? parseInt(mfgYearRaw, 10)
        : null;

    // ----------------------------------------
    // REQUIRED DETAILS CHECK
    // ----------------------------------------

    if (!name || !phone) {
      return jsonResponse(
        {
          success: false,
          message:
            "Name and mobile number are required.",
        },
        400
      );
    }

    // ----------------------------------------
    // APPLICATION ID
    // ----------------------------------------

    const applicationId =
      crypto.randomUUID();

    const uploaded = {
      rc_path: null,
      insurance_path: null,
      puc_path: null,
      dl_path: null,
      aadhaar_path: null,
      pan_path: null,
      vehicle_photo_paths: [],
    };

    // ----------------------------------------
    // DOCUMENT UPLOAD
    // ----------------------------------------

    async function processDocument(
      fieldName,
      databaseField
    ) {

      const file =
        formData.get(fieldName);

      if (
        !file ||
        typeof file.arrayBuffer !==
          "function"
      ) {
        throw new Error(
          `${fieldName.toUpperCase()} document is required.`
        );
      }

      if (
        !ALLOWED_DOCUMENT_TYPES.includes(
          file.type
        )
      ) {
        throw new Error(
          `${file.name || fieldName}: Only JPG, PNG or PDF files are allowed.`
        );
      }

      if (file.size <= 0) {
        throw new Error(
          `${file.name || fieldName} is empty.`
        );
      }

      const safeName =
        cleanFileName(file.name);

      const path =
        `${applicationId}/${fieldName}-${safeName}`;

      const uploadedPath =
        await uploadToSupabase(
          file,
          path
        );

      uploadedFiles.push(
        uploadedPath
      );

      uploaded[databaseField] =
        uploadedPath;
    }

    // Required documents
    await processDocument(
      "rc",
      "rc_path"
    );

    await processDocument(
      "insurance",
      "insurance_path"
    );

    await processDocument(
      "puc",
      "puc_path"
    );

    await processDocument(
      "dl",
      "dl_path"
    );

    await processDocument(
      "aadhaar",
      "aadhaar_path"
    );

    await processDocument(
      "pan",
      "pan_path"
    );

    // ----------------------------------------
    // VEHICLE PHOTOS
    // ----------------------------------------

    const vehiclePhotos =
      formData.getAll(
        "vehicle_photos"
      );

    if (
      vehiclePhotos.length >
      MAX_VEHICLE_PHOTOS
    ) {
      throw new Error(
        "Maximum 4 vehicle photos are allowed."
      );
    }

    for (
      const file of vehiclePhotos
    ) {

      if (
        !file ||
        typeof file.arrayBuffer !==
          "function"
      ) {
        continue;
      }

      if (
        !ALLOWED_PHOTO_TYPES.includes(
          file.type
        )
      ) {
        throw new Error(
          `${file.name || "Vehicle photo"}: Only JPG, PNG or WEBP images are allowed.`
        );
      }

      if (file.size <= 0) {
        throw new Error(
          `${file.name || "Vehicle photo"} is empty.`
        );
      }

      const safeName =
        cleanFileName(file.name);

      const path =
        `${applicationId}/vehicle-photos/${safeName}`;

      const uploadedPath =
        await uploadToSupabase(
          file,
          path
        );

      uploadedFiles.push(
        uploadedPath
      );

      uploaded.vehicle_photo_paths.push(
        uploadedPath
      );
    }

    // ----------------------------------------
    // SAVE APPLICATION TO DATABASE
    // ----------------------------------------

    const application = {

      id: applicationId,

      name,

      phone,

      email:
        email || null,

      alternate_phone:
        alternatePhone || null,

      car_brand:
        carBrand || null,

      car_model:
        carModel || null,

      mfg_year:
        Number.isInteger(mfgYear)
          ? mfgYear
          : null,

      rc_path:
        uploaded.rc_path,

      insurance_path:
        uploaded.insurance_path,

      puc_path:
        uploaded.puc_path,

      dl_path:
        uploaded.dl_path,

      aadhaar_path:
        uploaded.aadhaar_path,

      pan_path:
        uploaded.pan_path,

      vehicle_photo_paths:
        uploaded.vehicle_photo_paths,
    };

    await saveApplication(
      application
    );

    // ----------------------------------------
    // EMAIL NOTIFICATION
    // ----------------------------------------

    await sendNotificationEmail(
      application
    );

    // ----------------------------------------
    // SUCCESS
    // ----------------------------------------

    return jsonResponse({
      success: true,

      message:
        "Partner application submitted successfully.",

      application_id:
        applicationId,
    });

  } catch (error) {

    console.error(
      "Partner application error:",
      error
    );

    // ----------------------------------------
    // CLEANUP
    // ----------------------------------------

    for (
      const path of uploadedFiles
    ) {
      await deleteUploadedFile(
        path
      );
    }

    return jsonResponse(
      {
        success: false,

        message:
          error.message ||
          "Unable to submit partner application.",
      },
      500
    );
  }
}
