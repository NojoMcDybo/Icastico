//! The score library: a folder "Icastico" in the user's documents with one
//! sub-folder per collection ("Sammlung") and a trash folder ("Papierkorb").
//!
//! Safety rule: every command that creates, renames or deletes something only
//! acts INSIDE the library folder. Paths from the frontend are checked.

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};

pub const TRASH: &str = "Papierkorb";
const EXTENSION: &str = "icastico";
/// Larger files are listed without contents (they cannot be scores).
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

/// The library folder, known after `library_root` ran once.
#[derive(Default)]
pub struct LibraryRoot(pub Mutex<Option<PathBuf>>);

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub path: String,
    /// True on the very first start (the folder did not exist yet).
    pub created: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    /// Sub-folder name, None for scores directly in the library folder.
    pub collection: Option<String>,
    pub trashed: bool,
    /// Last modification, milliseconds since 1970.
    pub modified: u64,
    pub contents: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct Scan {
    pub collections: Vec<String>,
    pub entries: Vec<Entry>,
}

// ── Plain functions (tested below) ──────────────────────────────────────────

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn is_score(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(EXTENSION))
}

fn entries_in(dir: &Path, collection: Option<&str>, trashed: bool, out: &mut Vec<Entry>) -> std::io::Result<()> {
    for item in fs::read_dir(dir)? {
        let item = item?;
        let path = item.path();
        let meta = item.metadata()?;
        let name = item.file_name().to_string_lossy().into_owned();
        if !meta.is_file() || is_hidden(&name) || !is_score(&path) {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        let contents = if meta.len() <= MAX_FILE_BYTES { fs::read_to_string(&path).ok() } else { None };
        out.push(Entry {
            path: path.to_string_lossy().into_owned(),
            collection: collection.map(str::to_owned),
            trashed,
            modified,
            contents,
        });
    }
    Ok(())
}

/// Lists collections and scores: the library folder, its sub-folders, the trash.
pub fn scan(root: &Path) -> std::io::Result<Scan> {
    let mut collections = Vec::new();
    let mut entries = Vec::new();
    entries_in(root, None, false, &mut entries)?;
    for item in fs::read_dir(root)? {
        let item = item?;
        let name = item.file_name().to_string_lossy().into_owned();
        if !item.metadata()?.is_dir() || is_hidden(&name) {
            continue;
        }
        if name == TRASH {
            entries_in(&item.path(), None, true, &mut entries)?;
        } else {
            entries_in(&item.path(), Some(&name), false, &mut entries)?;
            collections.push(name);
        }
    }
    collections.sort_by_key(|c| c.to_lowercase());
    Ok(Scan { collections, entries })
}

/// Resolves `path` and refuses anything outside `root` (and `root` itself).
pub fn inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    const OUTSIDE: &str = "Das geht nur innerhalb der Icastico-Bibliothek.";
    let path = Path::new(path);
    let name = path.file_name().ok_or(OUTSIDE)?;
    if name == ".." || name == "." {
        return Err(OUTSIDE.into());
    }
    let root = root.canonicalize().map_err(|e| format!("Bibliothek nicht gefunden ({e})."))?;
    let parent = path.parent().ok_or(OUTSIDE)?.canonicalize().map_err(|_| OUTSIDE.to_string())?;
    if !parent.starts_with(&root) {
        return Err(OUTSIDE.into());
    }
    Ok(parent.join(name))
}

pub fn create_file(target: &Path, contents: &str) -> Result<(), String> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(target).map_err(|e| match e.kind() {
        ErrorKind::AlreadyExists => "Eine Datei mit diesem Namen gibt es schon.".to_string(),
        _ => format!("Datei konnte nicht angelegt werden ({e})."),
    })?;
    file.write_all(contents.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|e| format!("Datei konnte nicht geschrieben werden ({e})."))
}

pub fn rename(from: &Path, to: &Path) -> Result<(), String> {
    // std::fs::rename would silently replace an existing file on Windows.
    if to.exists() {
        return Err("Am Ziel gibt es schon etwas mit diesem Namen.".into());
    }
    fs::rename(from, to).map_err(|e| format!("Umbenennen/Verschieben fehlgeschlagen ({e})."))
}

// ── Commands ────────────────────────────────────────────────────────────────

fn root(state: &State<LibraryRoot>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .ok()
        .and_then(|r| r.clone())
        .ok_or_else(|| "Die Bibliothek ist noch nicht bereit.".to_string())
}

/// Finds (and on the first start creates) Documents/Icastico.
#[tauri::command]
pub fn library_root(app: AppHandle, state: State<LibraryRoot>) -> Result<RootInfo, String> {
    let documents = app
        .path()
        .document_dir()
        .ok()
        .or_else(|| app.path().home_dir().ok().map(|h| h.join("Documents")))
        .ok_or("Der Dokumente-Ordner wurde nicht gefunden.")?;
    let root = documents.join("Icastico");
    let created = !root.exists();
    fs::create_dir_all(&root).map_err(|e| format!("Bibliotheksordner konnte nicht angelegt werden ({e})."))?;
    if let Ok(mut r) = state.0.lock() {
        *r = Some(root.clone());
    }
    Ok(RootInfo { path: root.to_string_lossy().into_owned(), created })
}

#[tauri::command]
pub fn library_scan(state: State<LibraryRoot>) -> Result<Scan, String> {
    scan(&root(&state)?).map_err(|e| format!("Bibliothek konnte nicht gelesen werden ({e})."))
}

#[tauri::command]
pub fn library_create_file(state: State<LibraryRoot>, path: String, contents: String) -> Result<(), String> {
    create_file(&inside(&root(&state)?, &path)?, &contents)
}

#[tauri::command]
pub fn library_rename(state: State<LibraryRoot>, from: String, to: String) -> Result<(), String> {
    let root = root(&state)?;
    rename(&inside(&root, &from)?, &inside(&root, &to)?)
}

#[tauri::command]
pub fn library_create_dir(state: State<LibraryRoot>, path: String) -> Result<(), String> {
    let target = inside(&root(&state)?, &path)?;
    fs::create_dir(&target).map_err(|e| match e.kind() {
        ErrorKind::AlreadyExists => "Eine Sammlung mit diesem Namen gibt es schon.".to_string(),
        _ => format!("Sammlung konnte nicht angelegt werden ({e})."),
    })
}

#[tauri::command]
pub fn library_delete_file(state: State<LibraryRoot>, path: String) -> Result<(), String> {
    let target = inside(&root(&state)?, &path)?;
    if !target.is_file() {
        return Err("Nur einzelne Dateien können gelöscht werden.".into());
    }
    fs::remove_file(&target).map_err(|e| format!("Löschen fehlgeschlagen ({e})."))
}

/// Removes an EMPTY collection folder.
#[tauri::command]
pub fn library_remove_dir(state: State<LibraryRoot>, path: String) -> Result<(), String> {
    let target = inside(&root(&state)?, &path)?;
    fs::remove_dir(&target).map_err(|e| match e.kind() {
        ErrorKind::DirectoryNotEmpty => "Die Sammlung ist nicht leer.".to_string(),
        _ => format!("Sammlung konnte nicht entfernt werden ({e})."),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("icastico-lib-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scans_collections_trash_and_ignores_other_files() {
        let root = temp_root("scan");
        fs::create_dir(root.join("Lieder")).unwrap();
        fs::create_dir(root.join(TRASH)).unwrap();
        fs::create_dir(root.join(".versteckt")).unwrap();
        fs::write(root.join("A.icastico"), "a").unwrap();
        fs::write(root.join("Lieder").join("B.icastico"), "b").unwrap();
        fs::write(root.join(TRASH).join("C.icastico"), "c").unwrap();
        fs::write(root.join("Einkaufsliste.txt"), "x").unwrap();
        fs::write(root.join(TRASH).join(".herkunft.json"), "{}").unwrap();

        let s = scan(&root).unwrap();
        assert_eq!(s.collections, vec!["Lieder".to_string()]);
        let mut found: Vec<_> = s
            .entries
            .iter()
            .map(|e| (e.contents.clone().unwrap(), e.collection.clone(), e.trashed))
            .collect();
        found.sort();
        assert_eq!(
            found,
            vec![
                ("a".into(), None, false),
                ("b".into(), Some("Lieder".into()), false),
                ("c".into(), None, true),
            ]
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn refuses_paths_outside_the_library() {
        let root = temp_root("guard");
        fs::create_dir(root.join("Lieder")).unwrap();
        assert!(inside(&root, &root.join("Lieder").join("x.icastico").to_string_lossy()).is_ok());
        assert!(inside(&root, &root.join("Lieder").to_string_lossy()).is_ok());
        let escape = root.join("Lieder").join("..").join("..").join("böse.icastico");
        assert!(inside(&root, &escape.to_string_lossy()).is_err());
        assert!(inside(&root, &std::env::temp_dir().join("x.icastico").to_string_lossy()).is_err());
        assert!(inside(&root, &root.join("..").to_string_lossy()).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn never_overwrites_by_accident() {
        let root = temp_root("safe");
        let a = root.join("A.icastico");
        let b = root.join("B.icastico");
        create_file(&a, "eins").unwrap();
        assert!(create_file(&a, "zwei").unwrap_err().contains("gibt es schon"));
        fs::write(&b, "bleibt").unwrap();
        assert!(rename(&a, &b).is_err());
        assert_eq!(fs::read_to_string(&b).unwrap(), "bleibt");
        assert_eq!(fs::read_to_string(&a).unwrap(), "eins");
        fs::remove_dir_all(&root).unwrap();
    }
}
