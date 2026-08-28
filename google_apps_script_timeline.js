/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: Google Drive Image Uploader for Timeline
 * ==============================================================================
 * 
 * STEP-BY-STEP SETUP INSTRUCTIONS:
 * ------------------------------------------------------------------------------
 * 1. Open Google Apps Script:
 *    Go to https://script.google.com/ and click "+ New project".
 * 
 * 2. Paste this code:
 *    Delete any code in `Code.gs` and paste this entire file content.
 * 
 * 3. Deploy as Web App:
 *    - Click the blue "Deploy" button at top right -> "New deployment".
 *    - Click the gear icon (⚙️) next to "Select type" -> select "Web app".
 *    - Fill in settings:
 *        * Description: Timeline Image Uploader
 *        * Execute as: Me (your Google account)
 *        * Who has access: Anyone (IMPORTANT: must be "Anyone" so the app can upload without login errors)
 *    - Click "Deploy".
 * 
 * 4. Authorize Access:
 *    - Google will prompt you to "Authorize access" -> choose your Google account.
 *    - Click "Advanced" -> "Go to Untitled project (unsafe)" -> "Allow".
 * 
 * 5. Copy Web App URL:
 *    - Copy the Web app URL (it ends in `/exec`, e.g. https://script.google.com/macros/s/.../exec).
 * 
 * 6. Save in your Timeline:
 *    - Open Timeline -> Click the ⚙️ button next to "Photo" in the post composer.
 *    - Paste your Web App URL and click "Save Settings".
 * 
 * That's it! All timeline photos will now upload straight to your Google Drive!
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
    var fileName = data.fileName || ("timeline_img_" + new Date().getTime() + ".jpg");
    var mimeType = data.mimeType || "image/jpeg";
    var base64Data = data.base64Data;
    var folderName = data.folderName || "TimelineDB";
    var folderId = data.folderId || "";

    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No base64 image data provided."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Decode base64 image data to binary blob
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);

    // Locate or create target folder in Google Drive
    var targetFolder = null;
    if (folderId && folderId.trim() !== "") {
      try {
        targetFolder = DriveApp.getFolderById(folderId.trim());
      } catch (idErr) {
        // If folder ID not found or error, fall back to searching by name
      }
    }
    
    if (!targetFolder) {
      var folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        targetFolder = folders.next();
      } else {
        var pFolders = DriveApp.getFoldersByName("picdb");
        if (pFolders.hasNext()) {
          targetFolder = pFolders.next();
        } else {
          var tFolders = DriveApp.getFoldersByName("TimelineDB");
          if (tFolders.hasNext()) {
            targetFolder = tFolders.next();
          } else {
            targetFolder = DriveApp.createFolder(folderName || "picdb");
          }
        }
      }
    }

    // Check if a file with the same name already exists in the target folder
    // If found, safely trash the old file so the new binary file replaces it cleanly without corruption
    var existingFiles = targetFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      var oldFile = existingFiles.next();
      try {
        oldFile.setTrashed(true);
      } catch (trashErr) {
        // Continue if file cannot be trashed
      }
    }

    // Create fresh binary file and grant public read permission so it displays on website
    var file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    
    // Direct Google CDN thumbnail & view URL for fast, reliable image display
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var ucUrl = "https://drive.google.com/uc?id=" + fileId + "&export=view";

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: fileId,
      url: directUrl,
      directUrl: directUrl,
      photoUrl: directUrl,
      viewUrl: ucUrl,
      fileName: fileName
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
    service: "Timeline Google Drive Upload API",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
