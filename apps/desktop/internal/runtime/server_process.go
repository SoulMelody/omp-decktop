package runtime

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ServerProcess manages the Bun server child process lifecycle.
type ServerProcess struct {
	cmd     *exec.Cmd
	port    int
	host    string
	cancel  context.CancelFunc
}

const defaultPort = 8787

// isPortAvailable checks if a TCP port is free on the given host.
func isPortAvailable(host string, port int) bool {
	addr := fmt.Sprintf("%s:%d", host, port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// findFreePort asks the OS for an available TCP port.
func findFreePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("find free port: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	return port, nil
}

// resolvePort picks the server port:
//   1. If OMP_DECK_PORT is already set in the environment, honor it.
//   2. Otherwise try the default port (8787).
//   3. If the default is occupied, fall back to a random free port.
func resolvePort() (int, error) {
	// 1. Explicit env var takes priority
	if envPort := os.Getenv("OMP_DECK_PORT"); envPort != "" {
		var p int
		if _, err := fmt.Sscanf(envPort, "%d", &p); err == nil && p > 0 && p < 65536 {
			log.Printf("[desktop] using OMP_DECK_PORT=%d from environment", p)
			return p, nil
		}
	}

	// 2. Try default port
	if isPortAvailable("127.0.0.1", defaultPort) {
		log.Printf("[desktop] using default port %d", defaultPort)
		return defaultPort, nil
	}

	// 3. Fall back to random free port
	port, err := findFreePort()
	if err != nil {
		return 0, err
	}
	log.Printf("[desktop] default port %d in use, using random port %d", defaultPort, port)
	return port, nil
}

// resolveRepoRoot walks up from the executable to find the omp-deck repo root.
// In dev mode, the desktop app is at apps/desktop/, so repo root is ../../.
func resolveRepoRoot() (string, error) {
	// Try environment variable first (for packaged builds)
	if root := os.Getenv("OMP_DECK_REPO_ROOT"); root != "" {
		return root, nil
	}

	// In development, we're at apps/desktop/
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable: %w", err)
	}
	dir := filepath.Dir(exe)

	// Walk up looking for apps/server/src/index.ts
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "apps", "server", "src", "index.ts")
		if _, err := os.Stat(candidate); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	// Fallback: assume cwd is the repo root
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get cwd: %w", err)
	}
	return cwd, nil
}

// findBun locates the Bun executable on PATH.
func findBun() (string, error) {
	bunPath := "bun"
	if runtime.GOOS == "windows" {
		// On Windows, also try bun.exe
		bunPath = "bun.exe"
	}
	path, err := exec.LookPath(bunPath)
	if err != nil {
		// Try common install locations on Windows
		home, _ := os.UserHomeDir()
		candidates := []string{
			filepath.Join(home, ".bun", "bin", "bun.exe"),
			filepath.Join(home, "scoop", "shims", "bun.exe"),
			"C:\\Program Files\\bun\\bun.exe",
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c, nil
			}
		}
		return "", fmt.Errorf("bun not found on PATH. Install from https://bun.sh")
	}
	return path, nil
}

// Start launches the Bun server as a child process.
func (sp *ServerProcess) Start() error {
	port, err := resolvePort()
	if err != nil {
		return err
	}
	sp.port = port
	sp.host = "127.0.0.1"

	bunPath, err := findBun()
	if err != nil {
		return err
	}

	repoRoot, err := resolveRepoRoot()
	if err != nil {
		return err
	}

	serverEntry := filepath.Join(repoRoot, "apps", "server", "src", "index.ts")
	if _, err := os.Stat(serverEntry); err != nil {
		return fmt.Errorf("server entry missing at %s", serverEntry)
	}

	ctx, cancel := context.WithCancel(context.Background())
	sp.cancel = cancel

	cmd := exec.CommandContext(ctx, bunPath, serverEntry)
	cmd.Dir = repoRoot
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Set environment variables for the server
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("OMP_DECK_HOST=%s", sp.host),
		fmt.Sprintf("OMP_DECK_PORT=%d", sp.port),
		fmt.Sprintf("OMP_DECK_WEB_DIST=%s", filepath.Join(repoRoot, "apps", "web", "dist")),
		fmt.Sprintf("OMP_DECK_STARTER_SKILLS_DIR=%s", filepath.Join(repoRoot, "starter-skills")),
		fmt.Sprintf("OMP_DECK_STARTER_EXTENSIONS_DIR=%s", filepath.Join(repoRoot, "starter-extensions")),
	)

	log.Printf("[desktop] starting bun server: %s %s (port %d)", bunPath, serverEntry, port)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start bun server: %w", err)
	}
	sp.cmd = cmd

	// Monitor process in background
	go func() {
		if err := cmd.Wait(); err != nil {
			log.Printf("[desktop] bun server exited: %v", err)
		} else {
			log.Printf("[desktop] bun server exited cleanly")
		}
	}()

	return nil
}

// URL returns the base URL of the running server.
func (sp *ServerProcess) URL() string {
	return fmt.Sprintf("http://%s:%d", sp.host, sp.port)
}

// WaitForHealthy polls the server until it responds or timeout is reached.
func (sp *ServerProcess) WaitForHealthy(timeout time.Duration) error {
	url := sp.URL() + "/api/health"
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		// Check if process is still alive
		if sp.cmd != nil && sp.cmd.ProcessState != nil {
			return fmt.Errorf("bun server exited prematurely")
		}

		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				log.Printf("[desktop] server healthy at %s", sp.URL())
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("server did not become healthy within %v", timeout)
}

// Stop gracefully stops the Bun server process.
func (sp *ServerProcess) Stop() {
	if sp.cancel != nil {
		sp.cancel()
	}
	if sp.cmd != nil && sp.cmd.Process != nil {
		log.Printf("[desktop] stopping bun server (pid %d)", sp.cmd.Process.Pid)
		// Try graceful shutdown first
		if runtime.GOOS == "windows" {
			// Windows doesn't have SIGTERM, use Kill
			sp.cmd.Process.Kill()
		} else {
			sp.cmd.Process.Signal(os.Interrupt)
			// Give it 5 seconds to shut down gracefully
			done := make(chan struct{})
			go func() {
				sp.cmd.Wait()
				close(done)
			}()
			select {
			case <-done:
				// Clean exit
			case <-time.After(5 * time.Second):
				sp.cmd.Process.Kill()
			}
		}
	}
}
