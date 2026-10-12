/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: Automated Quiz File & Image Uploader to Google Drive
 * ==============================================================================
 * 
 * FOLDER HIERARCHY CREATED AUTOMATICALLY:
 * 📁 Review (Root folder in your Google Drive)
 *    └── 📁 [Quiz Name] (e.g., "English Midterm Exam")
 *         └── 📁 [Class Name] (e.g., "Grade 9A")
 *              └── 📄 [Student Name] - [Student Code] - [File Name]
 * 
 * ------------------------------------------------------------------------------
 * STEP-BY-STEP DEPLOYMENT INSTRUCTIONS (Takes less than 2 minutes):
 * ------------------------------------------------------------------------------
 * 1. Open Google Apps Script:
 *    Go to https://script.google.com/home and click "+ New project".
 * 
 * 2. Paste this code:
 *    Delete all existing text in `Code.gs` and paste the entire code from this file.
 * 
 * 3. Deploy as a Web App:
 *    - Click the blue "Deploy" button at the top right ➔ select "New deployment".
 *    - Click the gear icon (⚙️) next to "Select type" ➔ choose "Web app".
 *    - Configure the following settings:
 *        * Description: "Quiz Review File Uploader"
 *        * Execute as: "Me" (your Google account)
 *        * Who has access: "Anyone" (CRITICAL: must be set to "Anyone" so students can upload without permission prompts)
 *    - Click "Deploy".
 * 
 * 4. Authorize Access:
 *    - Click "Authorize access" ➔ Choose your Google account.
 *    - Click "Advanced" ➔ Click "Go to Untitled project (unsafe)" ➔ Click "Allow".
 * 
 * 5. Copy the Web App URL:
 *    - Copy the Web App URL (ends in `/exec`, e.g., https://script.google.com/macros/s/.../exec).
 * 
 * 6. Save in Teacher Admin:
 *    - Go to Teacher Admin Dashboard ➔ Settings / Google Drive Settings.
 *    - Paste the Web App URL and click "Save Drive Script URL".
 * 
 * That's it! When students upload files on a quiz, they will be organized into:
 * Review / [Quiz Title] / [Class Name] / [Student Name] - [File] automatically!
 * ==============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No POST payload received."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var base64Data = data.base64Data;
    var originalFileName = data.fileName || ("quiz_upload_" + new Date().getTime() + ".pdf");
    var mimeType = data.mimeType || "application/octet-stream";

    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No base64 data provided."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Sanitize folder & file names
    var quizTitle = sanitizeFolderName(data.quizTitle || data.examName || "General Quiz");
    var className = sanitizeFolderName(data.studentClass || data.className || data.class || "General Class");
    var studentName = sanitizeFolderName(data.studentName || "Student");
    var studentCode = sanitizeFolderName(data.studentCode || "");

    // 2. Locate root folder: by explicit Folder ID if provided, otherwise by name ("Review")
    var rootFolder = null;
    var rawFolderId = (data.folderId || data.folderIdReview || data.rootFolder || "").toString().trim();
    var extractedFolderId = extractFolderId(rawFolderId);

    if (extractedFolderId) {
      try {
        rootFolder = DriveApp.getFolderById(extractedFolderId);
      } catch (idErr) {
        Logger.log("Folder by ID not found (" + extractedFolderId + "): " + idErr.toString());
      }
    }

    // Fallback: search/create folder by name in Drive root if no valid ID was found
    if (!rootFolder) {
      var rootFolderName = (data.rootFolder && !extractedFolderId ? data.rootFolder : (data.folderName || "Review")).trim();
      rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), rootFolderName);
    }

    // 3. Locate or create quiz folder: "Review / [Quiz Name]"
    var quizFolder = getOrCreateFolder(rootFolder, quizTitle);

    // 4. Locate or create class folder: "Review / [Quiz Name] / [Class Name]"
    var targetFolder = getOrCreateFolder(quizFolder, className);

    // 5. Build clean file name: "[Student Name] - [Student Code] - [Original Name]"
    var cleanFileName = studentName;
    if (studentCode) {
      cleanFileName += " (" + studentCode + ")";
    }
    cleanFileName += " - " + originalFileName;

    // Check if a file with this name already exists; if so, trash the older duplicate
    var existingFiles = targetFolder.getFilesByName(cleanFileName);
    while (existingFiles.hasNext()) {
      try {
        existingFiles.next().setTrashed(true);
      } catch (trashErr) {}
    }

    // 6. Decode base64 to binary blob and create the file in Google Drive
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, cleanFileName);
    var file = targetFolder.createFile(blob);

    // 7. Make file viewable by anyone with link so teachers can view/grade it
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var viewUrl = file.getUrl();
    var directUrl = "https://drive.google.com/uc?id=" + fileId + "&export=download";
    var cdnThumbnail = "https://lh3.googleusercontent.com/d/" + fileId;

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: fileId,
      fileName: cleanFileName,
      originalName: originalFileName,
      url: viewUrl,
      viewUrl: viewUrl,
      downloadUrl: directUrl,
      directUrl: directUrl,
      cdnUrl: cdnThumbnail,
      folderPath: rootFolderName + " / " + quizTitle + " / " + className
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Quiz Review Google Drive Uploader",
    targetRoot: "Review",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// Helper: Get or create subfolder inside a parent folder
function getOrCreateFolder(parentFolder, name) {
  var cleanName = (name || "Untitled").trim();
  var folders = parentFolder.getFoldersByName(cleanName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(cleanName);
}

// Helper: Strip illegal characters from folder/file names
function sanitizeFolderName(str) {
  if (!str) return "Untitled";
  return str.toString()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "Untitled";
}

// Helper: Extract folder ID from raw string or full Google Drive URL
function extractFolderId(val) {
  if (!val) return "";
  var str = val.toString().trim();
  var match = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  var matchId = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) return matchId[1];
  if (/^[a-zA-Z0-9_-]{15,50}$/.test(str) && str.toLowerCase() !== "review") {
    return str;
  }
  return "";
}
