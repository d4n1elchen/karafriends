import { toCanvas } from "qrcode";
import React, { useEffect, useRef } from "react";

import { getRoomId, roomUrl } from "../common/roomId";
import "./QRCode.css";

function QRCode(props: { hostname: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    function update() {
      if (!canvasRef.current) return;

      canvasRef.current.style.width = "100%";
      const remoteUrl = window.karafriends?.isDesktop
        ? `http://${props.hostname}/?room=${encodeURIComponent(getRoomId())}`
        : roomUrl("/remocon/");
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
  });

  return <canvas ref={canvasRef} className="qrcode" />;
}

export default QRCode;
