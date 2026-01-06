use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Handle file opened via file association on startup
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    // URLs will be available to frontend via event
                    for url in urls {
                        let url_string = url.as_str().to_string();
                        let _ = app.emit("deep-link-open", url_string);
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
