/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: TEACHER ADMINISTRATION & MEETING KOORDINASI UPLOADER
 * ==============================================================================
 * 
 * Purpose:
 * Uploads teacher administration documents (PDF, DOCX, XLSX, PPTX, Images)
 * directly into Google Drive inside:
 * 
 *   [My Drive]
 *     └── "Meeting Koordinasi" (or specified folderId)
 *           └── [Teacher's Name] (e.g., "John Doe")
 *                 └── [Uploaded Document]
 * 
 * Instructions to Deploy:
 * 1. Open Google Drive (drive.google.com) with your school/admin Google account.
 * 2. Create a new Google Apps Script project at https://script.google.com/home
 * 3. Delete existing code and paste this entire file contents into `Code.gs`.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "Teacher Administration Uploader".
 * 7. Set "Execute as": "Me" (your Google account).
 * 8. Set "Who has access": "Anyone" (allows upload requests without Google login).
 * 9. Click "Deploy" and authorize the requested Drive permissions.
 * 10. Copy the Web App URL (starts with https://script.google.com/macros/s/.../exec).
 * 11. Paste this Web App URL into Admin Dashboard > Scripting > Section 3 (or browser localStorage).
 * ==============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        status: "error",
        message: "No POST payload received."
      });
    }

    var data = JSON.parse(e.postData.contents);
    var fileName = data.fileName || ("Doc_" + new Date().getTime());
    var mimeType = data.mimeType || "application/octet-stream";
    var base64Data = data.base64Data;
    var folderId = (data.folderId || "").trim();
    var teacherName = (data.teacherName || data.teacher || data.subFolder || "General").trim();
    var rootFolderName = (data.folderName || data.targetFolder || "Meeting Koordinasi").trim();

    if (!base64Data) {
      return jsonResponse({
        status: "error",
        message: "No file data received."
      });
    }

    // 1. Locate or create the main folder ("Meeting Koordinasi")
    var rootFolder = null;
    if (folderId) {
      try {
        rootFolder = DriveApp.getFolderById(folderId);
      } catch (err) {
        // Fall back to name search if folderId is invalid or inaccessible
      }
    }

    if (!rootFolder) {
      var folders = DriveApp.getFoldersByName(rootFolderName);
      if (folders.hasNext()) {
        rootFolder = folders.next();
      } else {
        rootFolder = DriveApp.createFolder(rootFolderName);
      }
    }

    // 2. Locate or create the teacher's subfolder inside "Meeting Koordinasi"
    var teacherFolder = null;
    var subFolders = rootFolder.getFoldersByName(teacherName);
    if (subFolders.hasNext()) {
      teacherFolder = subFolders.next();
    } else {
      teacherFolder = rootFolder.createFolder(teacherName);
    }

    // 3. Decode base64 to binary blob
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);

    // 4. Check for existing file with exact same name to avoid duplicate clutter
    var existingFiles = teacherFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      var oldFile = existingFiles.next();
      try {
        oldFile.setTrashed(true);
      } catch (trashErr) {
        // Continue if trash permission not granted
      }
    }

    // 5. Create the file inside teacher's subfolder
    var file = teacherFolder.createFile(blob);

    // 6. Set public view permission so preview links work across the web portal
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignore if domain policy forbids public sharing
    }

    var fileId = file.getId();
    var viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
    var downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    var directUrl = viewUrl;

    // Use fast CDN preview if it's an image
    if (mimeType.indexOf("image/") === 0) {
      directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    }

    return jsonResponse({
      status: "success",
      fileId: fileId,
      url: viewUrl,
      fileUrl: viewUrl,
      viewUrl: viewUrl,
      downloadUrl: downloadUrl,
      directUrl: directUrl,
      fileName: fileName,
      teacher: teacherName,
      folderPath: rootFolderName + " / " + teacherName
    });

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

function doGet(e) {
  return jsonResponse({
    status: "online",
    service: "Teacher Administration & Meeting Koordinasi Google Drive Uploader",
    timestamp: new Date().toISOString()
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
