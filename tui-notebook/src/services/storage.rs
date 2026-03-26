//! Storage service - File system operations
//!
//! Handles reading, writing, and watching notebook files.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

/// File change event
#[derive(Debug, Clone)]
pub enum FileEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
}

/// Storage service error
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(PathBuf),
    #[error("Permission denied: {0}")]
    PermissionDenied(PathBuf),
}

/// Storage service for file operations
pub struct StorageService {
    root_path: PathBuf,
}

impl StorageService {
    /// Create a new storage service
    pub fn new(root_path: PathBuf) -> Self {
        Self { root_path }
    }

    /// Get root path
    pub fn root_path(&self) -> &Path {
        &self.root_path
    }

    /// Resolve a relative path to absolute
    pub fn resolve(&self, path: &str) -> PathBuf {
        self.root_path.join(path)
    }

    /// Read a file
    pub async fn read_file(&self, path: &str) -> Result<String, StorageError> {
        let full_path = self.resolve(path);

        if !full_path.exists() {
            return Err(StorageError::NotFound(full_path));
        }

        tokio::fs::read_to_string(&full_path).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                StorageError::PermissionDenied(full_path.clone())
            } else {
                StorageError::Io(e)
            }
        })
    }

    /// Write a file
    pub async fn write_file(&self, path: &str, content: &str) -> Result<(), StorageError> {
        let full_path = self.resolve(path);

        // Ensure parent directory exists
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        tokio::fs::write(&full_path, content).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                StorageError::PermissionDenied(full_path.clone())
            } else {
                StorageError::Io(e)
            }
        })
    }

    /// Delete a file
    pub async fn delete_file(&self, path: &str) -> Result<(), StorageError> {
        let full_path = self.resolve(path);

        if !full_path.exists() {
            return Err(StorageError::NotFound(full_path));
        }

        tokio::fs::remove_file(&full_path)
            .await
            .map_err(StorageError::Io)
    }

    /// List files in a directory
    pub async fn list_files(&self, dir: &str) -> Result<Vec<PathBuf>, StorageError> {
        let full_path = self.resolve(dir);

        if !full_path.exists() {
            return Err(StorageError::NotFound(full_path));
        }

        let mut entries = tokio::fs::read_dir(&full_path).await?;

        let mut files = Vec::new();
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
            }
        }

        Ok(files)
    }

    /// List all markdown files recursively
    pub async fn list_markdown_files(&self) -> Result<Vec<PathBuf>, StorageError> {
        let files = self.list_markdown_files_recursive(&self.root_path);
        Ok(files)
    }

    fn list_markdown_files_recursive(&self, dir: &Path) -> Vec<PathBuf> {
        let mut files = Vec::new();

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();

                if path.is_dir() {
                    // Skip hidden directories
                    if path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with('.'))
                        .unwrap_or(false)
                    {
                        continue;
                    }

                    files.extend(self.list_markdown_files_recursive(&path));
                } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    files.push(path);
                }
            }
        }

        files
    }

    /// Check if a path exists
    pub async fn exists(&self, path: &str) -> bool {
        self.resolve(path).exists()
    }

    /// Create a directory
    pub async fn create_dir(&self, path: &str) -> Result<(), StorageError> {
        let full_path = self.resolve(path);
        tokio::fs::create_dir_all(&full_path)
            .await
            .map_err(StorageError::Io)
    }

    /// Rename a file or directory
    pub async fn rename(&self, old_path: &str, new_path: &str) -> Result<(), StorageError> {
        let old_full = self.resolve(old_path);
        let new_full = self.resolve(new_path);

        if !old_full.exists() {
            return Err(StorageError::NotFound(old_full));
        }

        // Ensure parent of new path exists
        if let Some(parent) = new_full.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        tokio::fs::rename(&old_full, &new_full)
            .await
            .map_err(StorageError::Io)
    }

    /// Copy a file
    pub async fn copy(&self, src: &str, dst: &str) -> Result<(), StorageError> {
        let src_full = self.resolve(src);
        let dst_full = self.resolve(dst);

        if !src_full.exists() {
            return Err(StorageError::NotFound(src_full));
        }

        // Ensure parent of destination exists
        if let Some(parent) = dst_full.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        tokio::fs::copy(&src_full, &dst_full).await?;
        Ok(())
    }

    /// Get file metadata
    pub async fn metadata(&self, path: &str) -> Result<std::fs::Metadata, StorageError> {
        let full_path = self.resolve(path);

        if !full_path.exists() {
            return Err(StorageError::NotFound(full_path));
        }

        tokio::fs::metadata(&full_path)
            .await
            .map_err(StorageError::Io)
    }
}
