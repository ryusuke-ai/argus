"use client";

interface FileInfo {
  name: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
}

interface DirEntry {
  dir: string;
  files: FileInfo[];
}

interface Props {
  entries: DirEntry[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileList({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-slate-400">No generated files found</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.dir} className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-semibold font-mono text-slate-800 mb-3">{entry.dir}</h2>
          <div className="space-y-3">
            {entry.files.map((file) => (
              <div key={file.name} className="flex items-center gap-4">
                {file.isImage ? (
                  <div className="space-y-2">
                    <img
                      src={`/api/files/${entry.dir}/${file.name}`}
                      alt={file.name}
                      className="max-w-md rounded-lg border border-slate-200"
                    />
                    <p className="text-sm text-slate-400">
                      {file.name} ({formatSize(file.size)})
                    </p>
                  </div>
                ) : file.isVideo ? (
                  <div className="space-y-2">
                    <video
                      src={`/api/files/${entry.dir}/${file.name}`}
                      controls
                      className="max-w-md rounded-lg border border-slate-200"
                    />
                    <p className="text-sm text-slate-400">
                      {file.name} ({formatSize(file.size)})
                    </p>
                  </div>
                ) : (
                  <a
                    href={`/api/files/${entry.dir}/${file.name}`}
                    download
                    className="text-blue-600 hover:underline flex items-center gap-2"
                  >
                    <span>{file.name}</span>
                    <span className="text-sm text-slate-400">
                      ({formatSize(file.size)})
                    </span>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
