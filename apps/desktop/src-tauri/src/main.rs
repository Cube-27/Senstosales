// The minimal Tauri entry (D-0008): plugin registration and configuration only. Starting the sidecar, the app window
// and every message live in TypeScript (apps/desktop/src).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_log::{log::LevelFilter, Target, TargetKind};

fn main() {
    // The shell log goes beside the sidecar's logs in the data folder (INV-82).
    let logs = match std::env::var_os("LOCALAPPDATA") {
        Some(dir) => TargetKind::Folder {
            path: PathBuf::from(dir).join("SenstoSales").join("logs"),
            file_name: Some("shell".into()),
        },
        None => TargetKind::LogDir {
            file_name: Some("shell".into()),
        },
    };
    tauri::Builder::default()
        // First: a second launch exits here and brings the running app window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(logs))
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("SenstoSales could not open its window");
}
