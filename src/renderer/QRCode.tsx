import { toCanvas } from "qrcode";
import React, { useEffect, useRef, useState } from "react";

import { getRoomId } from "../common/roomId";
import "./QRCode.css";

function QRCode(props: { hostname: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (window.karafriends?.isDesktop) {
      setRemoteUrl(
        `http://${props.hostname}/?room=${encodeURIComponent(getRoomId())}`,
      );
      return;
    }

    const controller = new AbortController();
    const url = new URL("/api/remote-access", window.location.origin);
    url.searchParams.set("room", getRoomId());
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to create remote URL (${response.status})`);
        }
        return response.json() as Promise<{ remoteUrl: string }>;
      })
      .then((payload) => setRemoteUrl(payload.remoteUrl))
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Unable to create remote QR code:", error);
      });

    return () => controller.abort();
  }, [props.hostname]);

  useEffect(() => {
    function update() {
      if (!canvasRef.current || !remoteUrl) return;

      canvasRef.current.style.width = "100%";
      toCanvas(
        canvasRef.current,
        remoteUrl,
        {
          errorCorrectionLevel: "L",
          width: canvasRef.current.clientWidth,
        },
        (error) => {
          if (error) {
            console.error(error);
          }
        },
      );
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [remoteUrl]);

  return <canvas ref={canvasRef} className="qrcode" />;
}

export default QRCode;
