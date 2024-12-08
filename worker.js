const Bull = require('bull');
const { promises: fs } = require('fs');
const path = require('path');
const imageThumbnail = require('image-thumbnail');
const dbClient = require('./utils/db');

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const db = dbClient.client.db(dbClient.dbName);
  const filesCollection = db.collection('files');
  const file = await filesCollection.findOne({ _id: new ObjectID(fileId), userId: new ObjectID(userId) });

  if (!file) {
    throw new Error('File not found');
  }

  const sizes = [500, 250, 100];
  const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

  for (const size of sizes) {
    const options = { width: size };
    const thumbnail = await imageThumbnail(file.localPath, options);
    const thumbnailPath = path.join(folderPath, `${path.basename(file.localPath)}_${size}`);
    await fs.writeFile(thumbnailPath, thumbnail);
  }
});
