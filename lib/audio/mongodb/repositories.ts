import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import type { Voice, TTSHistory, SubtitleHistory } from '@/types/audio/database';

function isValidObjectId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  if (id.length !== 24) {
    return false;
  }

  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return false;
  }

  try {
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

export class VoiceRepository {
  private static getCollection() {
    return getDb().then(db => db.collection<Voice>('voices'));
  }

  static async findByUserId(userId: string) {
    const collection = await this.getCollection();
    return await collection.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  static async findById(id: string) {
    const collection = await this.getCollection();

    if (isValidObjectId(id)) {
      return await collection.findOne({ _id: new ObjectId(id) });
    } else {
      return await collection.findOne({ voiceId: id });
    }
  }

  static async findByVoiceId(voiceId: string) {
    const collection = await this.getCollection();
    return await collection.findOne({ voiceId });
  }

  static async create(voice: Omit<Voice, '_id' | 'createdAt' | 'updatedAt'>) {
    const collection = await this.getCollection();
    const now = new Date();
    const result = await collection.insertOne({
      ...voice,
      userId: typeof voice.userId === 'string' ? new ObjectId(voice.userId) : voice.userId,
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId;
  }

  static async update(id: string, updates: Partial<Voice>) {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
  }

  static async delete(id: string, userId: string) {
    const collection = await this.getCollection();

    if (isValidObjectId(id)) {
      await collection.deleteOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });
    } else {
      await collection.deleteOne({
        voiceId: id,
        userId: new ObjectId(userId),
      });
    }
  }
}

export class TTSHistoryRepository {
  private static getCollection() {
    return getDb().then(db => db.collection<TTSHistory>('tts_history'));
  }

  static async findByUserId(userId: string, limit = 20) {
    const collection = await this.getCollection();
    return await collection.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async create(history: Omit<TTSHistory, '_id' | 'createdAt'>) {
    const collection = await this.getCollection();
    const result = await collection.insertOne({
      ...history,
      userId: typeof history.userId === 'string' ? new ObjectId(history.userId) : history.userId,
      createdAt: new Date(),
    });
    return result.insertedId;
  }

  static async delete(id: string, userId: string) {
    const collection = await this.getCollection();
    await collection.deleteOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
    });
  }
}

export class SubtitleHistoryRepository {
  private static getCollection() {
    return getDb().then(db => db.collection<SubtitleHistory>('subtitle_history'));
  }

  static async findByUserId(userId: string, limit = 50) {
    const collection = await this.getCollection();
    return await collection.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async findById(id: string, userId: string) {
    const collection = await this.getCollection();
    return await collection.findOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
    });
  }

  static async create(history: Omit<SubtitleHistory, '_id' | 'createdAt'>) {
    const collection = await this.getCollection();
    const result = await collection.insertOne({
      ...history,
      userId: typeof history.userId === 'string' ? new ObjectId(history.userId) : history.userId,
      createdAt: new Date(),
    });
    return result.insertedId;
  }

  static async delete(id: string, userId: string) {
    const collection = await this.getCollection();
    await collection.deleteOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
    });
  }
}

