import json
import os
import sys
import subprocess as _subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Profile:
    live_id: str
    live_url: str
    nickname: str | None
    avatar_url: str | None
    room_status: int | None
    is_live: bool | None
    updated_at: str | None
    error: str | None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_fetcher(live_id: str):
    """
    Reuse the existing implementation in D:\\ppt\\douyin\\a_bogus\\liveMan.py
    so we can generate a static JSON for Cloudflare Pages.
    """
    repo_root = Path(__file__).resolve().parents[1]  # cf-pages-demo/
    douyin_abogus = repo_root.parent / "douyin" / "a_bogus"
    sys.path.insert(0, str(douyin_abogus))
    from liveMan import DouyinLiveWebFetcher  # type: ignore

    return DouyinLiveWebFetcher(live_id)


def compute_is_live(room_status: int | None) -> bool | None:
    if room_status is None:
        return None
    return room_status == 0


def download_avatar_to_assets(url: str, dest: Path) -> bool:
    """下载抖音头像到站点默认 assets/avatar.png，首屏即显示最新头像。"""
    if not url or not url.startswith("http"):
        return False
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://live.douyin.com/",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if not data or len(data) < 100:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def main() -> int:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
        # Match the approach used in D:\ppt\douyin scripts: ensure subprocess uses UTF-8
        # to avoid cp1252/gbk issues when passing JS/Chinese text to Node (PyExecJS).
        _orig = _subprocess.Popen.__init__

        def _utf8(self, *args, **kwargs):
            if "encoding" not in kwargs:
                kwargs["encoding"] = "utf-8"
            return _orig(self, *args, **kwargs)

        _subprocess.Popen.__init__ = _utf8

    live_id = os.environ.get("DOUYIN_LIVE_ID", "49330409995").strip()
    live_url = f"https://live.douyin.com/{live_id}"

    out_path = Path(__file__).resolve().parents[1] / "data" / "profile.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    profile = Profile(
        live_id=live_id,
        live_url=live_url,
        nickname=None,
        avatar_url=None,
        room_status=None,
        is_live=None,
        updated_at=utc_now_iso(),
        error=None,
    )

    try:
        fetcher = load_fetcher(live_id)
        # Trigger room_id resolution; may print logs.
        _ = fetcher.room_id
        if not fetcher.room_id:
            profile.error = "获取 room_id 失败（可能被反爬拦截/网络问题/直播间不可用）"
        else:
            room_status, nickname, avatar_url = fetcher.fetch_room_status_ex()
            profile.room_status = room_status
            profile.nickname = nickname or None
            profile.avatar_url = (avatar_url or None) if avatar_url else None
            profile.is_live = compute_is_live(room_status)
            assets_avatar = Path(__file__).resolve().parents[1] / "assets" / "avatar.png"
            if avatar_url and download_avatar_to_assets(avatar_url, assets_avatar):
                print(f"Updated default avatar: {assets_avatar}")
    except Exception as e:
        profile.error = f"更新失败：{e}"

    out_path.write_text(
        json.dumps(profile.__dict__, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote: {out_path}")
    print(json.dumps(profile.__dict__, ensure_ascii=False, indent=2))
    return 0 if not profile.error else 2


if __name__ == "__main__":
    raise SystemExit(main())

