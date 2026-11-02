//! Native side of Icastico.
//!
//! The score logic lives in TypeScript (src/core). This crate is for what a
//! webview cannot do well or at all: MIDI devices, low-latency audio,
//! audio-to-notes inference, file system. See docs/architecture.md.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Icastico konnte nicht gestartet werden");
}
