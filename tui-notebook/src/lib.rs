#![allow(dead_code)]
// The library intentionally exposes modules and helper APIs that are consumed
// by integration tests and future TUI surfaces, even when the current binary
// does not hit every path yet.

//! tui-notebook library
//!
//! Exposes internal modules for testing.

pub mod action;
pub mod app;
pub mod components;
pub mod i18n;
pub mod models;
pub mod services;
pub mod theme;
pub mod tui;
