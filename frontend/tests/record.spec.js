import { test, expect } from "@playwright/test";

/**
 * RecordPage E2E tests.
 *
 * Uses window.__CI_E2E__ to activate MockAuth0Provider so the recording
 * UI renders without real Auth0.  MediaRecorder is stubbed so the browser
 * never prompts for microphone permission.
 */
test.describe("RecordPage", () => {
  test.beforeEach(async ({ page }) => {
    // Activate mock auth + stub MediaRecorder before React loads
    await page.addInitScript(() => {
      window.__CI_E2E__ = true;

      // Minimal MediaRecorder stub — avoids browser permission prompts
      class FakeMediaRecorder extends EventTarget {
        constructor(stream) {
          super();
          this.stream = stream;
          this.state  = "inactive";
          this.mimeType = "audio/webm";
        }
        start(timeslice) {
          this.state = "recording";
          this.dispatchEvent(new Event("start"));
        }
        stop() {
          this.state = "inactive";
          // Emit a blob of silence
          const evt = new Event("dataavailable");
          evt.data = new Blob([], { type: "audio/webm" });
          this.dispatchEvent(evt);
          this.dispatchEvent(new Event("stop"));
        }
        pause()  { this.state = "paused"; }
        resume() { this.state = "recording"; }
        static isTypeSupported(type) { return type.startsWith("audio/"); }
      }
      window.MediaRecorder = FakeMediaRecorder;

      // Stub getUserMedia so the browser never shows the permission prompt
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new AudioContext();
          const dst = ctx.createMediaStreamDestination();
          return dst.stream;
        };
      }
    });

    // Mock all Supabase Edge Function calls
    await page.route("**/functions/v1/create-session**", (route) =>
      route.fulfill({
        status: 201,
        json: {
          session_id: "test-record-session",
          tasks: [
            { task_id: "t1", task_type: "SUSTAINED_VOWEL", task_status: "PENDING" },
            { task_id: "t2", task_type: "READING",         task_status: "PENDING" },
            { task_id: "t3", task_type: "DDK",             task_status: "PENDING" },
          ],
        },
      })
    );
    await page.route("**/functions/v1/upload-url**", (route) =>
      route.fulfill({
        json: {
          signedUrl: "http://localhost:54321/storage/v1/object/sign/audio/test.wav",
          path:      "test/path/audio.wav",
          expiresIn: 3600,
        },
      })
    );
    await page.route("**/functions/v1/finalize-task**", (route) =>
      route.fulfill({
        json: { task_status: "ANALYZED", analysis_json: { summary: ["Test summary."] } },
      })
    );
    await page.route("**/functions/v1/**", (route) => route.fulfill({ json: {} }));

    await page.goto("/record");
    await page.waitForLoadState("networkidle");
  });

  test("RecordPage renders without crashing", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
  });

  test("page does not show the LandingPage hero", async ({ page }) => {
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Hear what your/i);
  });

  test("page does not show a React error boundary", async ({ page }) => {
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Something went wrong/i);
    expect(bodyText).not.toMatch(/Unhandled error/i);
  });
});
