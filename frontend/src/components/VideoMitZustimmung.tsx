import { useEffect, useRef, useState } from "react";

/**
 * Bettet ein YouTube-Video erst nach einem Klick ein ("Zwei-Klick-Loesung", Datenschutz). Eine <iframe> mit youtube-nocookie.com
 * verbindet beim Laden der Seite mit YouTube/Google und uebertraegt dabei die IP-Adresse - auch wenn niemand auf Wiedergabe
 * klickt. Deshalb zeigt die Seite zuerst nur diesen Hinweis; die Verbindung entsteht erst auf ausdruecklichen Wunsch.
 * Barrierefrei: echter Knopf, Hinweistext davor, nach dem Klick springt der Fokus auf den Video-Rahmen (sonst ginge er mit dem
 * verschwundenen Knopf verloren).
 */
export function VideoMitZustimmung({ embedUrl, titel }: { embedUrl: string; titel: string }) {
  const [geladen, setGeladen] = useState(false);
  const rahmenRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (geladen) rahmenRef.current?.focus();
  }, [geladen]);

  if (geladen) {
    return (
      <iframe
        ref={rahmenRef}
        src={embedUrl}
        title={titel}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }
  return (
    <div className="video-zustimmung">
      <p>
        {titel}. Das Video liegt bei YouTube. Beim Laden wird deine IP-Adresse an YouTube übertragen. Es wird erst geladen, wenn du
        es möchtest.
      </p>
      <button type="button" onClick={() => setGeladen(true)}>
        Video laden
      </button>
    </div>
  );
}
