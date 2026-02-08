use std::collections::HashMap;
use std::sync::Mutex;
#[cfg(windows)]
use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewWindow, Emitter};
#[cfg(not(windows))]
use tauri_plugin_shell::ShellExt;
#[cfg(not(windows))]
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::process::CommandChild;
#[cfg(windows)]
use tokio::io::{BufReader, AsyncBufReadExt};
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use system_shutdown::{shutdown, reboot, sleep, hibernate};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const APP_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

enum ChildProcess {
    #[allow(dead_code)]
    Tauri(CommandChild),
    #[cfg(windows)]
    WindowsPid(u32),
}

struct AppState {
    children: Mutex<HashMap<String, ChildProcess>>,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct FinishPayload {
    id: String,
    code: Option<i32>,
}

#[derive(Serialize, Clone)]
struct ErrorPayload {
    id: String,
    error: String,
}

#[derive(Deserialize, Serialize, Clone)]
struct GithubRelease {
    tag_name: String,
    body: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize, Serialize, Clone)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
fn minimize_app(window: WebviewWindow) {
    window.minimize().unwrap();
}

#[tauri::command]
fn maximize_app(window: WebviewWindow) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}

#[tauri::command]
fn close_app(window: WebviewWindow) {
    window.close().unwrap();
}

#[tauri::command]
async fn check_dependencies(app: AppHandle) -> Result<serde_json::Value, String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    
    let (ytdlp_name, ffmpeg_name, deno_name) = if cfg!(windows) {
        ("yt-dlp.exe", "bin/ffmpeg.exe", "deno.exe")
    } else {
        ("yt-dlp", "bin/ffmpeg", "deno")
    };

    let ytdlp_path = local_app_data.join(format!("YTDLP/{}", ytdlp_name));
    let ffmpeg_path = local_app_data.join(format!("FFMPEG/{}", ffmpeg_name));
    let deno_path = local_app_data.join(format!("DENO/{}", deno_name));

    let ytdlp_status = if ytdlp_path.exists() {
        match check_ytdlp_update(&ytdlp_path).await {
            Ok(update_available) => !update_available,
            Err(_) => true,
        }
    } else {
        false
    };

    Ok(serde_json::json!({
        "ytdlp": ytdlp_status,
        "ffmpeg": ffmpeg_path.exists(),
        "deno": deno_path.exists()
    }))
}

async fn check_ytdlp_update(path: &PathBuf) -> Result<bool, String> {
    let local_hash = compute_sha256(path)?;
    let remote_hash = fetch_latest_ytdlp_hash().await?;
    Ok(local_hash.to_lowercase() != remote_hash.to_lowercase())
}

fn compute_sha256(path: &PathBuf) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    use std::io::Read;

    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 4096];

    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }

    Ok(hex::encode(hasher.finalize()))
}

async fn fetch_latest_ytdlp_hash() -> Result<String, String> {
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to fetch SUMS: {}", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;
    
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let filename = parts[1];
            let target_filename = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
            if filename.trim() == target_filename {
                return Ok(parts[0].to_string());
            }
        }
    }

    Err("Hash for yt-dlp.exe not found".into())
}

#[tauri::command]
async fn get_video_info(app: AppHandle, payload: String) -> Result<serde_json::Value, String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    let ytdlp_name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    let ytdlp_path = local_app_data.join(format!("YTDLP/{}", ytdlp_name));

    if !ytdlp_path.exists() { return Err("yt-dlp missing".into()); }

    let mut args = vec![
        "--dump-single-json".to_string(), 
        "--flat-playlist".to_string(), 
        "--no-warnings".to_string(),
        "--user-agent".to_string(),
        APP_USER_AGENT.to_string()
    ];

    let cookies_path = local_app_data.join("cookies.txt");
    if cookies_path.exists() {
        args.push("--cookies".to_string());
        args.push(cookies_path.to_string_lossy().to_string());
    }

    if payload.contains("v=") && payload.contains("list=") {
        args.push("--no-playlist".to_string());
    }

    args.push(payload);

    let deno_dir = local_app_data.join("DENO");
    let path_var = std::env::var("PATH").unwrap_or_default();
    let path_sep = if cfg!(windows) { ";" } else { ":" };
    let new_path = format!("{}{}{}", deno_dir.to_string_lossy(), path_sep, path_var);

    println!("[DEBUG] Executing Info Command:");
    println!("  Binary: {:?}", ytdlp_path);
    println!("  Args: {:?}", args);

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new(ytdlp_path.to_str().unwrap());
        cmd.args(&args).env("PATH", &new_path);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        return serde_json::from_slice(&output.stdout).map_err(|e| e.to_string());
    }

    #[cfg(not(windows))]
    {
        let shell = app.shell();
        let output = shell.command(ytdlp_path.to_str().unwrap())
            .args(args)
            .env("PATH", new_path)
            .output()
            .await
            .map_err(|e: tauri_plugin_shell::Error| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|f| f.to_string()));
    });
    rx.await.map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct DownloadArgs {
    id: String,
    url: String,
    #[serde(rename = "type")]
    download_type: String,
    quality: String,
    #[serde(rename = "outputDir")]
    output_dir: String,
    #[serde(rename = "videoExt")]
    video_ext: Option<String>,
    #[serde(rename = "audioExt")]
    audio_ext: Option<String>,
    #[serde(rename = "thumbExt")]
    thumb_ext: Option<String>,
    #[serde(rename = "hwAccel")]
    hw_accel: Option<String>,
}

fn detect_best_hw_encoder(ffmpeg_path: &PathBuf) -> Option<String> {
    use std::process::Command;
    
    let output = Command::new(ffmpeg_path)
        .arg("-encoders")
        .output()
        .ok()?;
        
    let encoders = String::from_utf8_lossy(&output.stdout);
    
    if encoders.contains("h264_nvenc") {
        return Some("h264_nvenc".to_string());
    }
    if encoders.contains("h264_qsv") {
        return Some("h264_qsv".to_string());
    }
    if encoders.contains("h264_amf") {
        return Some("h264_amf".to_string());
    }
    
    None
}

fn extract_height(s: &str) -> Option<String> {
    if let Some(idx) = s.find("height<=") {
        let remainder = &s[idx + 8..];
        let num_str: String = remainder.chars()
            .take_while(|c| c.is_numeric())
            .collect();
        if !num_str.is_empty() {
            return Some(num_str);
        }
    }
    None
}

#[tauri::command]
async fn start_download(app: AppHandle, payload: DownloadArgs, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    
    let (ytdlp_name, ffmpeg_name) = if cfg!(windows) {
        ("yt-dlp.exe", "bin/ffmpeg.exe")
    } else {
        ("yt-dlp", "bin/ffmpeg")
    };

    let ytdlp_path = local_app_data.join(format!("YTDLP/{}", ytdlp_name));
    let ffmpeg_path = local_app_data.join(format!("FFMPEG/{}", ffmpeg_name));

    if !ffmpeg_path.exists() {
        return Err("FFmpeg not found. Please re-download dependencies.".into());
    }

    let mut args = vec![
        "--verbose".into(),
        "--ignore-config".into(), "--progress".into(), "--no-playlist".into(),
        "--encoding".into(), "utf-8".into(), "--newline".into(),
        "--geo-bypass".into(), "--no-mtime".into(),
        "--user-agent".into(), APP_USER_AGENT.into(),
        "--extractor-args".into(), "youtube:player_client=web".into(),
        "-o".into(), format!("{}/%(title)s [%(id)s].%(ext)s", payload.output_dir),
    ];

    let cookies_path = local_app_data.join("cookies.txt");
    if cookies_path.exists() {
        println!("Using cookies from: {:?}", cookies_path);
        args.push("--cookies".into());
        args.push(cookies_path.to_string_lossy().into_owned());
    }

    match payload.download_type.as_str() {
        "video" => {
            let mut quality_val = payload.quality.clone();
            
            if !quality_val.chars().all(|c| c.is_numeric()) && quality_val.contains("height<=") {
                 if let Some(h) = extract_height(&quality_val) {
                     quality_val = h;
                     println!("[DEBUG] Extracted resolution {} from complex format string", quality_val);
                 }
            }

            let quality_clean = quality_val.to_lowercase().replace("p", "");
            let quality_trimmed = quality_clean.trim();

            let is_numeric = !quality_trimmed.is_empty() && quality_trimmed.chars().all(|c| c.is_numeric());

            if is_numeric {
                 let sort_args = format!("res:{},vcodec:h264,acodec:aac", quality_trimmed);
                 args.extend(["-S".into(), sort_args]);
            } else {
                 if !payload.quality.contains("+") {
                      args.extend(["-f".into(), format!("{}+ba/b", payload.quality)]);
                 } else {
                      args.extend(["-f".into(), payload.quality]);
                 }
            }

            let video_ext = payload.video_ext.clone().unwrap_or_else(|| "mp4".into());
            args.extend(["--merge-output-format".into(), video_ext.clone()]);

            if payload.hw_accel.as_deref() == Some("auto") {
                args.extend(["--recode-video".into(), video_ext]);
                
                if let Some(encoder) = detect_best_hw_encoder(&ffmpeg_path) {
                     let ppa = format!("video-convert:-vcodec {}", encoder);
                     args.extend(["--postprocessor-args".into(), ppa]);
                }
            }

            args.extend(["--ffmpeg-location".into(), ffmpeg_path.parent().unwrap().to_str().unwrap().into()]);
        }
        "audio" => {
            let audio_ext = payload.audio_ext.unwrap_or_else(|| "mp3".into());
            args.extend(["-x".into(), "--audio-format".into(), audio_ext, "--audio-quality".into(), payload.quality,
                "--ffmpeg-location".into(), ffmpeg_path.parent().unwrap().to_str().unwrap().into()]);
        }
        "thumbnail" => {
            args.extend(["-f".into(), "best".into(), "--write-thumbnail".into(), "--skip-download".into()]);
            if let Some(ext) = payload.thumb_ext {
                args.extend(["--convert-thumbnails".into(), ext]);
            }
        }
        _ => {}
    }
    args.push(payload.url);

    let deno_dir = local_app_data.join("DENO");
    let path_var = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", deno_dir.to_string_lossy(), path_var);

    println!("[DEBUG] Executing Download Command:");
    println!("  Binary: {:?}", ytdlp_path);
    println!("  Args: {:?}", args);
    println!("  FFmpeg Location: {:?}", ffmpeg_path);

    let app_clone = app.clone();
    let download_id = payload.id.clone();

    #[cfg(windows)]
    {
        let mut cmd = tokio::process::Command::new(ytdlp_path.to_str().unwrap());
        cmd.args(&args)
           .env("PATH", &new_path)
           .env("PYTHONIOENCODING", "utf-8")
           .env("PYTHONUNBUFFERED", "1");
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let pid = child.id().unwrap_or(0);
        
        state.children.lock().unwrap().insert(download_id.clone(), ChildProcess::WindowsPid(pid));

        // Background task to read stdout
        let app_stdout = app_clone.clone();
        let id_stdout = download_id.clone();
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_stdout.emit("ytdlp-output", ProgressPayload { id: id_stdout.clone(), data: line });
            }
        });

        // Background task to read stderr
        let app_stderr = app_clone.clone();
        let id_stderr = download_id.clone();
        let mut stderr_reader = BufReader::new(stderr).lines();
        let error_lines = Arc::new(Mutex::new(Vec::new()));
        let error_lines_clone = error_lines.clone();
        
        tauri::async_runtime::spawn(async move {
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                if !line.trim().is_empty() {
                    let mut lines = error_lines_clone.lock().unwrap();
                    lines.push(line.clone());
                    if lines.len() > 10 { lines.remove(0); }
                }
                let formatted = format!("[STDERR] {}", line);
                let _ = app_stderr.emit("ytdlp-output", ProgressPayload { id: id_stderr.clone(), data: formatted });
            }
        });

        // Task to wait for child completion
        let app_term = app_clone.clone();
        let id_term = download_id.clone();
        tauri::async_runtime::spawn(async move {
            let status = child.wait().await;
            match status {
                Ok(s) => {
                    if s.success() {
                        let _ = app_term.emit("download-finished", FinishPayload { id: id_term, code: s.code() });
                    } else {
                        let lines = error_lines.lock().unwrap();
                        let error_msg = if lines.is_empty() {
                            format!("Process exited with code {:?}", s.code())
                        } else {
                            lines.join("\n")
                        };
                        let _ = app_term.emit("download-error", ErrorPayload { id: id_term, error: error_msg });
                    }
                }
                Err(e) => {
                    let _ = app_term.emit("download-error", ErrorPayload { id: id_term, error: e.to_string() });
                }
            }
        });
    }

    #[cfg(not(windows))]
    {
        let shell = app.shell();
        let (mut rx, child) = shell.command(ytdlp_path.to_str().unwrap())
            .args(args)
            .env("PATH", new_path)
            .spawn()
            .map_err(|e: tauri_plugin_shell::Error| e.to_string())?;

        state.children.lock().unwrap().insert(download_id.clone(), ChildProcess::Tauri(child));

        tauri::async_runtime::spawn(async move {
            let mut last_error_lines = Vec::new();
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let data = String::from_utf8_lossy(&line).into_owned();
                        let _ = app_clone.emit("ytdlp-output", ProgressPayload { id: download_id.clone(), data });
                    }
                    CommandEvent::Stderr(line) => {
                        let data = String::from_utf8_lossy(&line).into_owned();
                        if !data.trim().is_empty() {
                            last_error_lines.push(data.clone());
                            if last_error_lines.len() > 10 { last_error_lines.remove(0); }
                        }
                        let formatted = format!("[STDERR] {}", data);
                        let _ = app_clone.emit("ytdlp-output", ProgressPayload { id: download_id.clone(), data: formatted });
                    }
                    CommandEvent::Terminated(p) => {
                        if p.code.unwrap_or(1) != 0 {
                            let error_msg = if last_error_lines.is_empty() {
                                format!("Process exited with code {:?}", p.code)
                            } else {
                                last_error_lines.join("\n")
                            };
                            let _ = app_clone.emit("download-error", ErrorPayload { id: download_id.clone(), error: error_msg });
                        } else {
                            let _ = app_clone.emit("download-finished", FinishPayload { id: download_id.clone(), code: p.code });
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
async fn cancel_download(app: AppHandle, payload: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut children = state.children.lock().unwrap();
    if let Some(child_process) = children.remove(&payload) {
        match child_process {
            ChildProcess::Tauri(child) => {
                let _pid = child.pid();
                #[cfg(windows)]
                {
                    let mut cmd = std::process::Command::new("taskkill");
                    cmd.args(["/F", "/T", "/PID", &_pid.to_string()]);
                    #[cfg(windows)]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    let _ = cmd.status(); 
                }
                #[cfg(not(windows))]
                {
                    let _ = child.kill();
                }
            },
            #[cfg(windows)]
            ChildProcess::WindowsPid(pid) => {
                let mut cmd = std::process::Command::new("taskkill");
                cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
                #[cfg(windows)]
                cmd.creation_flags(CREATE_NO_WINDOW);
                let _ = cmd.status(); 
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
        let _ = app.emit("download-cancelled", payload);
    }
    Ok(())
}

#[tauri::command]
async fn open_path(payload: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        cmd.arg(payload);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(payload).spawn();
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(payload).spawn();
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct CleanupPayload {
    path: String,
    video_id: String,
}

#[tauri::command]
async fn cleanup_partial_files(payload: CleanupPayload) -> Result<(), String> {
    let download_path = std::path::Path::new(&payload.path);
    println!("Cleaning up partial files for ID: {} in path: {:?}", payload.video_id, download_path);
    
    if let Ok(entries) = std::fs::read_dir(download_path) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let id_with_brackets = format!("[{}]", payload.video_id);
            
            if (file_name.contains(&id_with_brackets) || file_name.contains(&payload.video_id)) && 
               (file_name.ends_with(".part") || file_name.ends_with(".ytdl") || file_name.contains(".temp") || file_name.contains(".f")) {
                println!("Deleting partial file: {}", file_name);
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn download_dependencies(app: AppHandle) -> Result<(), String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    let ytdlp_dir = local_app_data.join("YTDLP");
    let ffmpeg_dir = local_app_data.join("FFMPEG");
    let deno_dir = local_app_data.join("DENO");

    fs::create_dir_all(&ytdlp_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&ffmpeg_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&deno_dir).map_err(|e| e.to_string())?;

    let _ = app.emit("dependencies-download-start", "Checking for system updates...");

    let (ytdlp_url, ytdlp_name) = if cfg!(windows) {
        ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "yt-dlp.exe")
    } else {
        ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", "yt-dlp")
    };
    let ytdlp_path = ytdlp_dir.join(ytdlp_name);
    
    let need_ytdlp = if !ytdlp_path.exists() {
        true
    } else {
        match check_ytdlp_update(&ytdlp_path).await {
            Ok(update) => update,
            Err(_) => false, 
        }
    };

    if need_ytdlp {
        download_file(&app, ytdlp_url, &ytdlp_path, "Updating Core Engine (yt-dlp)...").await?;
        set_executable_permission(&ytdlp_path);
    }

    let ffmpeg_name = if cfg!(windows) { "bin/ffmpeg.exe" } else { "bin/ffmpeg" };
    let ffmpeg_bin = ffmpeg_dir.join(ffmpeg_name);
    if !ffmpeg_bin.exists() {
        let ffmpeg_zip = ffmpeg_dir.join("ffmpeg.zip");
        let ffmpeg_url = if cfg!(windows) {
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip"
        } else {
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
        };

        if ffmpeg_url.ends_with(".zip") {
            download_file(&app, ffmpeg_url, &ffmpeg_zip, "Downloading FFmpeg...").await?;
            extract_zip(&ffmpeg_zip, &ffmpeg_dir)?;
        } else {
            download_file(&app, ffmpeg_url, &ffmpeg_zip, "Downloading FFmpeg...").await?;
            extract_tar_xz(&ffmpeg_zip, &ffmpeg_dir)?;
        }
        let _ = fs::remove_file(ffmpeg_zip);
        set_executable_permission(&ffmpeg_bin);
    }

    let deno_name = if cfg!(windows) { "deno.exe" } else { "deno" };
    let deno_bin = deno_dir.join(deno_name);
    if !deno_bin.exists() {
        let deno_zip = deno_dir.join("deno.zip");
        let deno_url = if cfg!(windows) {
            "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
        } else {
            "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip"
        };
        download_file(&app, deno_url, &deno_zip, "Downloading Deno...").await?;
        extract_zip(&deno_zip, &deno_dir)?;
        let _ = fs::remove_file(deno_zip);
        set_executable_permission(&deno_bin);
    }

    let _ = app.emit("dependencies-download-finished", ());
    Ok(())
}

async fn download_file(app: &AppHandle, url: &str, path: &PathBuf, msg: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent(APP_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    use futures_util::StreamExt;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        std::io::copy(&mut &*chunk, &mut file).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total_size > 0 {
            let percent = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = app.emit("dependencies-download-progress", serde_json::json!({ "percent": percent, "details": msg }));
        }
    }
    Ok(())
}

fn extract_zip(zip_path: &PathBuf, dest_dir: &PathBuf) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() { Some(path) => dest_dir.join(path), None => continue };
        if (*file.name()).ends_with('/') { fs::create_dir_all(&outpath).map_err(|e| e.to_string())?; }
        else {
            if let Some(p) = outpath.parent() { if !p.exists() { fs::create_dir_all(&p).map_err(|e| e.to_string())?; } }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    fs::set_permissions(&outpath, fs::Permissions::from_mode(mode)).unwrap_or(());
                }
            }
        }
    }
    
    let nested_folders = [
        "ffmpeg-master-latest-win64-gpl-shared",
        "ffmpeg-master-latest-linux64-gpl"
    ];
    
    for folder in nested_folders {
        let nested = dest_dir.join(folder);
        if nested.exists() {
            move_dir_contents(&nested, dest_dir)?;
            let _ = fs::remove_dir_all(nested);
        }
    }
    Ok(())
}

fn extract_tar_xz(path: &PathBuf, dest_dir: &PathBuf) -> Result<(), String> {
    use std::process::Command;
    let status = Command::new("tar")
        .arg("-xJf")
        .arg(path)
        .arg("-C")
        .arg(dest_dir)
        .status()
        .map_err(|e| e.to_string())?;
        
    if !status.success() {
        return Err("Failed to extract .tar.xz".into());
    }
        
    let nested = dest_dir.join("ffmpeg-master-latest-linux64-gpl");
    if nested.exists() {
        move_dir_contents(&nested, dest_dir)?;
        let _ = fs::remove_dir_all(nested);
    }
    
    Ok(())
}

fn move_dir_contents(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest_path = dst.join(entry.file_name());
        if entry.path().is_dir() {
            if !dest_path.exists() {
                fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
            }
            move_dir_contents(&entry.path(), &dest_path)?;
        } else {
            fs::rename(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn set_executable_permission(path: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o755);
        let _ = fs::set_permissions(path, perms);
    }
}

#[cfg(windows)]
fn set_executable_permission(_path: &PathBuf) {}

#[tauri::command]
fn restart_app(app: AppHandle) { app.restart(); }

#[tauri::command]
fn get_app_version() -> String {
    // env!("CARGO_PKG_VERSION") is baked into the binary at compile time from Cargo.toml
    // This makes it 100% hardcoded and reliable even if metadata is stripped.
    env!("CARGO_PKG_VERSION").to_string()
}


#[tauri::command]
async fn get_cookies_status(app: AppHandle) -> Result<bool, String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    let cookies_path = local_app_data.join("cookies.txt");
    Ok(cookies_path.exists())
}

#[tauri::command]
async fn clear_cookies(app: AppHandle) -> Result<(), String> {
    let local_app_data = app.path().local_data_dir().unwrap();
    let cookies_path = local_app_data.join("cookies.txt");
    if cookies_path.exists() {
        fs::remove_file(cookies_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn extract_cookies(app: AppHandle, _browser: String) -> Result<(), String> {
    login_with_browser(app).await
}

#[tauri::command]
async fn login_with_browser(app: AppHandle) -> Result<(), String> {
    use headless_chrome::{Browser, LaunchOptions};
    use std::time::Duration;

    let local_app_data = app.path().local_data_dir().unwrap();
    let cookies_path = local_app_data.join("cookies.txt");
    
    let ua_arg = format!("--user-agent={}", APP_USER_AGENT);
    let args = vec![
        "--disable-blink-features=AutomationControlled",
        &ua_arg,
        "--no-first-run",
        "--no-service-autorun",
        "--password-store=basic"
    ];

    let launch_options = LaunchOptions::default_builder()
        .headless(false)
        .enable_gpu(true)
        .window_size(Some((1280, 800)))
        .args(args.iter().map(|s| std::ffi::OsStr::new(s)).collect())
        .build()
        .map_err(|e| e.to_string())?;

    let browser = Browser::new(launch_options).map_err(|e| e.to_string())?;
    let tab = browser.new_tab().map_err(|e| e.to_string())?;

    tab.navigate_to("https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F&uilel=3&hl=en")
        .map_err(|e| e.to_string())?;

    let _ = app.emit("login-status", "Browser opened. Please log in and wait for the window to close automatically or close it manually when done.");

    let mut logged_in = false;
    let start_time = std::time::Instant::now();
    
    loop {
        if start_time.elapsed() > Duration::from_secs(300) {
            return Err("Login timed out".into());
        }

        if let Ok(cookies) = tab.get_cookies() {
            let has_valid_sid = cookies.iter().any(|c| {
                c.name == "__Secure-3PSID" && (c.domain.contains("youtube.com") || c.domain.contains(".youtube.com"))
            });

            if has_valid_sid {
                std::thread::sleep(Duration::from_secs(2));
                logged_in = true;
                break;
            }
        } else {
            break;
        }
        
        std::thread::sleep(Duration::from_secs(1));
    }

    if !logged_in {
        return Err("Browser closed or login not detected. Please try again.".into());
    }

    let cookies = tab.get_cookies().map_err(|e| format!("Failed to get cookies: {}", e))?;
    
    let mut netscape_content = String::from("# Netscape HTTP Cookie File\n# This file is generated by YDPro\n\n");
    
    for cookie in cookies {
        let domain = cookie.domain;
        let flag = if domain.starts_with('.') { "TRUE" } else { "FALSE" };
        let path = cookie.path;
        let secure = if cookie.secure { "TRUE" } else { "FALSE" };
        let expiry = cookie.expires as i64;
        let name = cookie.name;
        let value = cookie.value;
        
        netscape_content.push_str(&format!("{}\t{}\t{}\t{}\t{}\t{}\t{}\n", 
            domain, flag, path, secure, expiry, name, value));
    }

    fs::write(cookies_path, netscape_content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn system_action(action: String) -> Result<(), String> {
    match action.as_str() {
        "shutdown" => shutdown().map_err(|e| e.to_string())?,
        "reboot" => reboot().map_err(|e| e.to_string())?,
        "sleep" => sleep().map_err(|e| e.to_string())?,
        "hibernate" => hibernate().map_err(|e| e.to_string())?,
        _ => return Err("Invalid action".into()),
    }
    Ok(())
}

#[tauri::command]
async fn check_for_updates() -> Result<Option<GithubRelease>, String> {
    let client = reqwest::Client::builder()
        .user_agent(APP_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    let url = "https://api.github.com/repos/Hayyan0/HMD/releases/latest";
    println!("[Updater] Checking GitHub API: {}", url);
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| {
            println!("[Updater] Request error: {}", e);
            e.to_string()
        })?;

    println!("[Updater] API status: {}", response.status());

    if !response.status().is_success() {
        if response.status() == 403 {
            println!("[Updater] Hit rate limit or blocked.");
        }
        return Ok(None);
    }

    let release: GithubRelease = response.json()
        .await
        .map_err(|e| {
            println!("[Updater] Deserialization error: {}", e);
            e.to_string()
        })?;

    println!("[Updater] Found latest version: {}", release.tag_name);
    Ok(Some(release))
}

#[tauri::command]
async fn download_and_install_update(app: AppHandle, payload: String) -> Result<(), String> {
    let url = payload;
    let temp_dir = std::env::temp_dir();
    let file_name = url.split('/').last().unwrap_or("update.exe");
    let mut dest_path = temp_dir.clone();
    dest_path.push(file_name);

    println!("[Updater] Downloading update to: {:?}", dest_path);

    download_file(&app, &url, &dest_path, "Downloading App Update...").await?;

    println!("[Updater] Download complete. Launching installer...");

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", &dest_path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        
        app.exit(0);
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        use std::os::unix::fs::PermissionsExt;
        
        if dest_path.extension().and_then(|e| e.to_str()) == Some("rpm") {
            // Try to install RPM via pkexec dnf
            let status = std::process::Command::new("pkexec")
                .args(["dnf", "install", "-y", &dest_path.to_string_lossy()])
                .status();

            if let Ok(s) = status {
                 if s.success() {
                     app.emit("update-installed", "RPM installed successfully").ok();
                     // Potentially restart? For now, we rely on user manually restarting
                 } else {
                     // Fallback to opening file
                     let _ = std::process::Command::new("xdg-open")
                        .arg(&dest_path)
                        .spawn();
                 }
            } else {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&dest_path)
                    .spawn();
            }
        } else if dest_path.extension().and_then(|e| e.to_str()) == Some("AppImage") {
             let mut perms = std::fs::metadata(&dest_path).unwrap().permissions();
             perms.set_mode(0o755);
             std::fs::set_permissions(&dest_path, perms).ok();

             let _ = std::process::Command::new(&dest_path)
                 .spawn();
             
             app.exit(0);
        } else {
             // Fallback
             if let Some(parent) = dest_path.parent() {
                let _ = std::process::Command::new("xdg-open")
                    .arg(parent)
                    .spawn();
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState { children: Mutex::new(HashMap::new()) })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            minimize_app, maximize_app, close_app, check_dependencies, get_video_info,
            select_folder, start_download, cancel_download, open_path, cleanup_partial_files,
            download_dependencies, restart_app,
            get_cookies_status, clear_cookies, extract_cookies, login_with_browser, system_action,
            check_for_updates, download_and_install_update, get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}