#!/usr/bin/env node

const { ObjectID } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const { promises: fs } = require('fs');
const path = require('path');
const mime = require('mime-types');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const Bull = require('bull');

const fileQueue = new Bull('fileQueue');

class FilesController {
  static async postUpload(req, res) {
    const { name, type, parentId = 0, isPublic = false, data } = req.body;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const redisKey = `auth_${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const db = dbClient.client.db(dbClient.dbName);
    const filesCollection = db.collection('files');

    if (parentId !== 0) {
      const parentFile = await filesCollection.findOne({ _id: new ObjectID(parentId) });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const newFile = {
      userId: new ObjectID(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? 0 : new ObjectID(parentId),
      localPath: '',
    };

    if (type === 'folder') {
      await filesCollection.insertOne(newFile);
      return res.status(201).json(newFile);
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileUUID = uuidv4();
    const filePath = path.join(folderPath, fileUUID);

    await fs.mkdir(folderPath, { recursive: true });
    await fs.writeFile(filePath, Buffer.from(data, 'base64'));

    newFile.localPath = filePath;
    const result = await filesCollection.insertOne(newFile);
    const insertedFile = result.ops[0];

    if (type === 'image') {
      // Add a job to the fileQueue for thumbnail generation
      fileQueue.add({ userId: userId.toString(), fileId: insertedFile._id.toString() });
    }

    return res.status(201).json(insertedFile);
  }

  // Other methods...

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;
    const size = req.query.size;

    const db = dbClient.client.db(dbClient.dbName);
    const filesCollection = db.collection('files');
    const file = await filesCollection.findOne({ _id: new ObjectID(fileId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file.isPublic && !token) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (token) {
      const redisKey = `auth_${token}`;
      const userId = await redisClient.get(redisKey);

      if (!userId || (file.userId.toString() !== userId && !file.isPublic)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    let filePath = file.localPath;
    if (size) {
      filePath = `${file.localPath}_${size}`;
    }

    try {
      const fileContent = await fs.readFile(filePath);
      const mimeType = mime.lookup(file.name);
      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileContent);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

module.exports = FilesController;
