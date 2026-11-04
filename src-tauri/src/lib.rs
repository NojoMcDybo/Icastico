//! Native side of Icastico.
//!
//! The score logic lives in TypeScript (src/core). This crate is for what a
//! webview cannot do well or at all: files, later MIDI devices, low-latency
//! audio and audio-to-notes inference. See docs/architecture.md.

mod library;

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A score file handed over by the operating system (double-click in
/// Explorer/Finder) that the frontend has not picked up yet.
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

#[tauri::command]
fn read_score_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Datei konnte nicht gelesen werden ({e})."))
}

/// Reads a file as raw bytes (compressed MusicXML is a zip). Returned as binary, not as a JSON list.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Datei konnte nicht gelesen werden ({e})."))
}

/// Writes atomically: first into a temporary file next to the target, flushed
/// to disk, then renamed over the target. A crash or power loss while saving
/// never leaves a half-written score behind – the old file stays intact.
#[tauri::command]
fn write_score_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(&path, contents.as_bytes())
}

/// The same for binary exports (PDF, compressed MusicXML).
#[tauri::command]
fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    write_atomic(&path, &data)
}

fn write_atomic(path: &str, contents: &[u8]) -> Result<(), String> {
    let target = PathBuf::from(path);
    let tmp = temp_path(&target);
    let result = (|| -> std::io::Result<()> {
        let mut file = File::create(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&tmp, &target)
    })();
    result.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Datei konnte nicht gespeichert werden ({e}).")
    })
}

fn temp_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".speichern.tmp");
    target.with_file_name(name)
}

/// Returns (and forgets) the file the OS asked us to open, if any.
#[tauri::command]
fn take_pending_file(pending: tauri::State<PendingFile>) -> Option<String> {
    pending.0.lock().ok()?.take()
}

fn is_score_file(path: &str) -> bool {
    path.to_lowercase().ends_with(".icastico")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows/Linux pass a double-clicked file as command-line argument.
    let initial = std::env::args().skip(1).find(|a| is_score_file(a));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Self-update from GitHub Releases (see docs/decisions/0010-updates.md).
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            let _ = app;
            Ok(())
        })
        .manage(PendingFile(Mutex::new(initial)))
        .manage(library::LibraryRoot::default())
        .invoke_handler(tauri::generate_handler![
            read_score_file,
            read_file_bytes,
            write_score_file,
            write_file_bytes,
            take_pending_file,
            library::library_root,
            library::library_scan,
            library::library_create_file,
            library::library_rename,
            library::library_create_dir,
            library::library_delete_file,
            library::library_remove_dir,
        ])
        .build(tauri::generate_context!())
        .expect("Icastico konnte nicht gestartet werden");

    app.run(|_app, _event| {
        // macOS delivers double-clicked files as an event instead.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            use tauri::{Emitter, Manager};
            let path = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .find(|p| is_score_file(p));
            if let Some(path) = path {
                if let Ok(mut pending) = _app.state::<PendingFile>().0.lock() {
                    *pending = Some(path);
                }
                let _ = _app.emit("open-file", ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_atomically_and_reads_back() {
        let dir = std::env::temp_dir().join(format!("icastico-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Lied.icastico").to_string_lossy().into_owned();

        write_score_file(path.clone(), "eins".into()).unwrap();
        write_score_file(path.clone(), "zwei".into()).unwrap();
        assert_eq!(read_score_file(path.clone()).unwrap(), "zwei");
        assert!(!temp_path(Path::new(&path)).exists(), "temporary file must be gone");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn writes_raw_bytes_atomically() {
        let dir = std::env::temp_dir().join(format!("icastico-wbytes-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Lied.pdf").to_string_lossy().into_owned();
        write_file_bytes(path.clone(), vec![0x25, 0x50, 0x44, 0x46, 0x00, 0xff]).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), vec![0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
        assert!(!temp_path(Path::new(&path)).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reads_raw_bytes() {
        let dir = std::env::temp_dir().join(format!("icastico-bytes-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Lied.mxl");
        std::fs::write(&path, [0x50u8, 0x4b, 0x03, 0x04, 0xff]).unwrap();
        assert!(read_file_bytes(path.to_string_lossy().into_owned()).is_ok());
        assert!(read_file_bytes("/gibt/es/nicht.mxl".into()).err().unwrap().starts_with("Datei konnte nicht gelesen werden"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reports_missing_files_in_german() {
        let err = read_score_file("/gibt/es/nicht.icastico".into()).unwrap_err();
        assert!(err.starts_with("Datei konnte nicht gelesen werden"));
    }

    #[test]
    fn recognises_score_files() {
        assert!(is_score_file("C:\\Noten\\Lied.ICASTICO"));
        assert!(!is_score_file("--flag"));
    }
}
