import { getAssetUrl } from "../lib/api";
import { formatDateTime, isImageFile } from "../lib/format";

export function ScreenshotGallery({ screenshots }) {
  return (
    <div className="gallery-grid">
      {screenshots.map((shot) => {
        const assetUrl = getAssetUrl(shot.file_url);
        const isImage = isImageFile(shot.file_path);

        return (
          <article className="gallery-card glass-panel" key={shot.id}>
            <div className="gallery-meta">
              <span className={`tag ${shot.screenshot_type}`}>{shot.screenshot_type}</span>
              <span>{formatDateTime(shot.uploaded_at)}</span>
            </div>
            {isImage ? (
              <img alt={`${shot.screenshot_type} screenshot`} src={assetUrl} />
            ) : (
              <a href={assetUrl} rel="noreferrer" target="_blank">
                Open uploaded file
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}
