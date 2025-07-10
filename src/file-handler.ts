#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import mime from 'mime-types';

export const FileUploadSchema = z.object({
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  buffer: z.instanceof(Buffer).optional(),
  path: z.string().optional(),
  encoding: z.string().optional(),
});

export const FileSearchSchema = z.object({
  directory: z.string(),
  extensions: z.array(z.string()).optional(),
  maxSize: z.number().optional(),
  recursive: z.boolean().default(true),
  pattern: z.string().optional(),
});

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  extension: string;
  created: Date;
  modified: Date;
  hash?: string;
}

export interface SearchResult {
  files: FileInfo[];
  totalFiles: number;
  totalSize: number;
  directories: string[];
}

export class FileHandler {
  private uploadDir: string;
  private maxFileSize: number;
  private allowedExtensions: string[];

  constructor(config: {
    uploadDir?: string;
    maxFileSize?: number;
    allowedExtensions?: string[];
  } = {}) {
    this.uploadDir = config.uploadDir || './uploads';
    this.maxFileSize = config.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.allowedExtensions = config.allowedExtensions || [
      '.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc', '.txt', '.json',
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'
    ];
    
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: z.infer<typeof FileUploadSchema>): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const validatedFile = FileUploadSchema.parse(file);
      
      // Validate file size
      if (validatedFile.size > this.maxFileSize) {
        return {
          success: false,
          error: `File too large. Maximum size is ${this.maxFileSize / (1024 * 1024)}MB`,
        };
      }

      // Validate file extension
      const extension = path.extname(validatedFile.originalName).toLowerCase();
      if (!this.allowedExtensions.includes(extension)) {
        return {
          success: false,
          error: `File type not allowed. Allowed types: ${this.allowedExtensions.join(', ')}`,
        };
      }

      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.randomBytes(8).toString('hex');
      const sanitizedName = this.sanitizeFilename(validatedFile.originalName);
      const filename = `${timestamp}_${hash}_${sanitizedName}`;
      const filePath = path.join(this.uploadDir, filename);

      // Save file
      if (validatedFile.buffer) {
        fs.writeFileSync(filePath, validatedFile.buffer);
      } else if (validatedFile.path) {
        fs.copyFileSync(validatedFile.path, filePath);
      } else {
        return {
          success: false,
          error: 'No file data provided',
        };
      }

      return {
        success: true,
        filePath: filePath,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  async searchFiles(criteria: z.infer<typeof FileSearchSchema>): Promise<SearchResult> {
    const validatedCriteria = FileSearchSchema.parse(criteria);
    const result: SearchResult = {
      files: [],
      totalFiles: 0,
      totalSize: 0,
      directories: [],
    };

    if (!fs.existsSync(validatedCriteria.directory)) {
      return result;
    }

    await this.searchDirectory(validatedCriteria.directory, validatedCriteria, result);
    
    result.totalFiles = result.files.length;
    result.totalSize = result.files.reduce((total, file) => total + file.size, 0);

    return result;
  }

  private async searchDirectory(
    directory: string,
    criteria: z.infer<typeof FileSearchSchema>,
    result: SearchResult
  ): Promise<void> {
    try {
      const items = fs.readdirSync(directory);

      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          result.directories.push(itemPath);
          
          if (criteria.recursive) {
            await this.searchDirectory(itemPath, criteria, result);
          }
        } else if (stats.isFile()) {
          const fileInfo = await this.getFileInfo(itemPath);
          
          // Apply filters
          if (this.matchesCriteria(fileInfo, criteria)) {
            result.files.push(fileInfo);
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${directory}:`, error);
    }
  }

  private matchesCriteria(file: FileInfo, criteria: z.infer<typeof FileSearchSchema>): boolean {
    // Check extensions
    if (criteria.extensions && criteria.extensions.length > 0) {
      if (!criteria.extensions.includes(file.extension)) {
        return false;
      }
    }

    // Check max size
    if (criteria.maxSize && file.size > criteria.maxSize) {
      return false;
    }

    // Check pattern
    if (criteria.pattern) {
      const regex = new RegExp(criteria.pattern, 'i');
      if (!regex.test(file.name)) {
        return false;
      }
    }

    return true;
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    const stats = fs.statSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      mimeType,
      extension,
      created: stats.birthtime,
      modified: stats.mtime,
    };
  }

  async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      fs.unlinkSync(filePath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(sourcePath)) {
        return {
          success: false,
          error: 'Source file not found',
        };
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(sourcePath, destinationPath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Move failed',
      };
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(sourcePath)) {
        return {
          success: false,
          error: 'Source file not found',
        };
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(sourcePath, destinationPath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Copy failed',
      };
    }
  }

  async createDirectory(dirPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Directory creation failed',
      };
    }
  }

  async listDirectory(dirPath: string): Promise<{ files: FileInfo[]; directories: string[]; error?: string }> {
    try {
      if (!fs.existsSync(dirPath)) {
        return {
          files: [],
          directories: [],
          error: 'Directory not found',
        };
      }

      const items = fs.readdirSync(dirPath);
      const files: FileInfo[] = [];
      const directories: string[] = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          directories.push(itemPath);
        } else {
          const fileInfo = await this.getFileInfo(itemPath);
          files.push(fileInfo);
        }
      }

      return { files, directories };
    } catch (error) {
      return {
        files: [],
        directories: [],
        error: error instanceof Error ? error.message : 'Directory listing failed',
      };
    }
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async validateFileIntegrity(filePath: string, expectedHash?: string): Promise<{ valid: boolean; hash: string; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          valid: false,
          hash: '',
          error: 'File not found',
        };
      }

      const hash = await this.calculateFileHash(filePath);
      
      if (expectedHash) {
        return {
          valid: hash === expectedHash,
          hash,
          error: hash !== expectedHash ? 'Hash mismatch' : undefined,
        };
      }

      return {
        valid: true,
        hash,
      };
    } catch (error) {
      return {
        valid: false,
        hash: '',
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  async validateFile(filePath: string): Promise<{ valid: boolean; type?: string; size?: number; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File does not exist' };
      }

      const stats = fs.statSync(filePath);
      const mimeType = mime.lookup(filePath);

      // Check file size (max 50MB)
      if (stats.size > this.maxFileSize) {
        return { valid: false, error: `File too large (max ${this.maxFileSize / (1024 * 1024)}MB)` };
      }

      // Check supported file types
      const extension = path.extname(filePath).toLowerCase();
      if (!this.allowedExtensions.includes(extension)) {
        return { valid: false, error: 'Unsupported file type' };
      }

      return {
        valid: true,
        type: mimeType || 'application/octet-stream',
        size: stats.size,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    oldestFile?: FileInfo;
    newestFile?: FileInfo;
  }> {
    const searchResult = await this.searchFiles({
      directory: this.uploadDir,
      recursive: true,
    });

    const fileTypes: Record<string, number> = {};
    let oldestFile: FileInfo | undefined;
    let newestFile: FileInfo | undefined;

    for (const file of searchResult.files) {
      // Count file types
      fileTypes[file.extension] = (fileTypes[file.extension] || 0) + 1;

      // Find oldest and newest files
      if (!oldestFile || file.created < oldestFile.created) {
        oldestFile = file;
      }
      if (!newestFile || file.created > newestFile.created) {
        newestFile = file;
      }
    }

    return {
      totalFiles: searchResult.totalFiles,
      totalSize: searchResult.totalSize,
      fileTypes,
      oldestFile,
      newestFile,
    };
  }
}
