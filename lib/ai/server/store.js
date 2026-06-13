import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldConvertObjectId(key) {
  return key === "_id" || key === "userId";
}

function normalizeMongoValue(key, value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMongoValue(key, item));
  }

  if (shouldConvertObjectId(key) && typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, normalizeMongoValue(childKey, childValue)])
    );
  }

  return value;
}

function normalizeMongoObject(value) {
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, normalizeMongoValue(key, childValue)])
  );
}

function normalizeMongoUpdate(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMongoObject(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const operatorEntries = [];
  const directFieldEntries = [];

  for (const [key, childValue] of Object.entries(value)) {
    if (key.startsWith("$")) {
      operatorEntries.push([key, normalizeMongoValue(key, childValue)]);
      continue;
    }

    directFieldEntries.push([key, normalizeMongoValue(key, childValue)]);
  }

  if (operatorEntries.length === 0) {
    return directFieldEntries.length === 0
      ? {}
      : { $set: Object.fromEntries(directFieldEntries) };
  }

  const normalizedUpdate = Object.fromEntries(operatorEntries);
  if (directFieldEntries.length > 0) {
    normalizedUpdate.$set = {
      ...(isPlainObject(normalizedUpdate.$set) ? normalizedUpdate.$set : {}),
      ...Object.fromEntries(directFieldEntries)
    };
  }

  return normalizedUpdate;
}

function buildProjection(selectValue) {
  if (!selectValue) {
    return undefined;
  }

  if (isPlainObject(selectValue)) {
    return selectValue;
  }

  const fields = String(selectValue)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    fields.map((field) => [field.startsWith("-") ? field.slice(1) : field, field.startsWith("-") ? 0 : 1])
  );
}

function cloneDocument(doc) {
  return doc == null ? doc : { ...doc };
}

function wrapDocument(doc) {
  if (!doc || typeof doc !== "object") {
    return doc;
  }

  const wrapped = { ...doc };
  Object.defineProperty(wrapped, "toObject", {
    value() {
      return cloneDocument(doc);
    },
    enumerable: false
  });

  return wrapped;
}

function wrapResult(result, lean) {
  if (Array.isArray(result)) {
    return lean ? result : result.map((item) => wrapDocument(item));
  }

  return lean ? result : wrapDocument(result);
}

class MongoQuery {
  constructor(executor) {
    this.executor = executor;
    this.projection = undefined;
    this.sortValue = undefined;
    this.leanValue = false;
  }

  select(value) {
    this.projection = buildProjection(value);
    return this;
  }

  sort(value) {
    this.sortValue = value;
    return this;
  }

  lean() {
    this.leanValue = true;
    return this;
  }

  async exec() {
    const result = await this.executor({
      projection: this.projection,
      sort: this.sortValue,
      lean: this.leanValue
    });

    return wrapResult(result, this.leanValue);
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }

  finally(onFinally) {
    return this.exec().finally(onFinally);
  }
}

function createModelStore({ collectionName, createDefaults }) {
  async function getCollection() {
    return (await getDb()).collection(collectionName);
  }

  return {
    find(filter = {}) {
      return new MongoQuery(async ({ projection, sort }) => {
        let cursor = (await getCollection()).find(normalizeMongoObject(filter));
        if (projection) {
          cursor = cursor.project(projection);
        }
        if (sort) {
          cursor = cursor.sort(sort);
        }
        return cursor.toArray();
      });
    },

    findOne(filter = {}) {
      return new MongoQuery(async ({ projection }) => {
        return (await getCollection()).findOne(normalizeMongoObject(filter), projection ? { projection } : undefined);
      });
    },

    findById(id) {
      const normalizedId = typeof id === "string" && ObjectId.isValid(id) ? new ObjectId(id) : id;
      return new MongoQuery(async ({ projection }) => {
        return (await getCollection()).findOne({ _id: normalizedId }, projection ? { projection } : undefined);
      });
    },

    findOneAndUpdate(filter = {}, update = {}, options = {}) {
      return new MongoQuery(async ({ projection }) => {
        const normalizedOptions = {
          upsert: options.upsert === true,
          returnDocument: options.new === true ? "after" : "before"
        };

        const result = await (await getCollection()).findOneAndUpdate(
          normalizeMongoObject(filter),
          normalizeMongoUpdate(update),
          projection ? { ...normalizedOptions, projection } : normalizedOptions
        );

        return result;
      });
    },

    async create(doc = {}) {
      const normalizedDoc = normalizeMongoObject({
        ...(typeof createDefaults === "function" ? createDefaults(doc) : {}),
        ...doc
      });
      const nextDoc = {
        _id: normalizedDoc?._id instanceof ObjectId ? normalizedDoc._id : new ObjectId(),
        ...normalizedDoc
      };

      await (await getCollection()).insertOne(nextDoc);
      return wrapDocument(nextDoc);
    },

    async updateOne(filter = {}, update = {}, options = {}) {
      return (await getCollection()).updateOne(
        normalizeMongoObject(filter),
        normalizeMongoUpdate(update),
        options
      );
    },

    async updateMany(filter = {}, update = {}, options = {}) {
      return (await getCollection()).updateMany(
        normalizeMongoObject(filter),
        normalizeMongoUpdate(update),
        options
      );
    },

    async deleteOne(filter = {}) {
      return (await getCollection()).deleteOne(normalizeMongoObject(filter));
    }
  };
}

export function isValidObjectId(value) {
  return ObjectId.isValid(value);
}

export const UserStore = createModelStore({
  collectionName: "users"
});

export const ConversationStore = createModelStore({
  collectionName: "ai_conversations",
  createDefaults(input) {
    return {
      title: "New Chat",
      model: null,
      settings: {
        mode: null,
        webSearch: null
      },
      pinned: false,
      messages: [],
      updatedAt: new Date(),
      ...(input || {})
    };
  }
});

export const BlobFileStore = createModelStore({
  collectionName: "ai_blob_files"
});
