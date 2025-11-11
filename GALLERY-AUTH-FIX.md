# 🔒 Gallery Authentication Fix

## Problem

The gallery was returning 401 errors when trying to display images and videos:
```
GET /api/media/{id}
Status: 401
Error: "Missing or invalid authorization header"
```

---

## Root Cause

### The Issue
When the gallery displays media using `<img>` and `<video>` HTML tags with `src` attributes pointing to `/api/media/{id}`, the browser makes those requests automatically **without** including the `Authorization` header.

### Why This Happened
1. We added authentication to all API endpoints (including `/api/media/{id}`)
2. Our `apiClient.ts` adds the `Authorization: Bearer <token>` header to `fetch()` requests
3. **But** `<img>` and `<video>` tags don't use our `apiClient` - they're direct browser requests
4. Result: 401 Unauthorized errors

---

## Solution

### Blob URL Approach

Instead of using direct URLs in `<img>` and `<video>` tags, we now:

1. **Fetch media with authentication** using `apiFetch()`
2. **Create blob URLs** from the response data
3. **Use blob URLs** in the `<img>` and `<video>` tags
4. **Clean up blob URLs** when component unmounts (prevents memory leaks)

### Implementation

```typescript
// Fetch media with authentication and create blob URL
const createBlobUrl = async (mediaId: string): Promise<string | null> => {
  const response = await apiFetch(`/api/media/${mediaId}`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  return blobUrl;
};

// Clean up on unmount
useEffect(() => {
  return () => {
    Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url));
  };
}, [blobUrls]);

// Use in rendering
<img src={blobUrls[item.id] || item.url} alt={item.prompt} />
<video src={blobUrls[item.id] || item.url} controls />
```

---

## Benefits

✅ **Works with authentication** - Fetches use proper Authorization headers
✅ **Secure** - No need to expose media without auth
✅ **Memory safe** - Blob URLs are properly cleaned up
✅ **Fallback** - Uses original URL if blob creation fails
✅ **Compatible** - Works with existing media storage system

---

## Technical Details

### Flow

1. **Load gallery** → `loadMedia()` called
2. **Fetch media list** → Get metadata for all media
3. **Create blob URLs** → Parallel fetch of all media with auth
4. **Store blob URLs** → State: `{ [mediaId]: blobUrl }`
5. **Render** → Use blob URLs in `<img>` and `<video>` tags
6. **Unmount** → Revoke all blob URLs to free memory

### State Management

```typescript
const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

// After loading media items
const newBlobUrls: Record<string, string> = {};
await Promise.all(
  parsed.map(async (item) => {
    const blobUrl = await createBlobUrl(item.id);
    if (blobUrl) {
      newBlobUrls[item.id] = blobUrl;
    }
  })
);
setBlobUrls(newBlobUrls);
```

### Memory Management

Blob URLs must be explicitly revoked to prevent memory leaks:

```typescript
useEffect(() => {
  return () => {
    // Cleanup on unmount
    Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url));
  };
}, [blobUrls]);
```

---

## Alternative Solutions (Not Used)

### 1. Token Query Parameter
```
GET /api/media/{id}?token=<jwt_token>
```
❌ **Rejected**: Security risk - tokens in URLs can be logged

### 2. Remove Authentication from Media Endpoint
```
@router.get("/{media_id}")
async def get_media(media_id: str):  # No auth
```
❌ **Rejected**: Security issue - anyone with ID can access media

### 3. Separate Public Media Endpoint
```
GET /api/public/media/{id}/{token}
```
❌ **Rejected**: Complex, tokens still in URL

---

## Performance Considerations

### Loading Time
- **Before**: Instant (direct URL)
- **After**: ~100-500ms per media (fetch with auth)

**Mitigation**: 
- Parallel fetching (all media loaded at once)
- Browser caching (blob in memory)
- Lazy loading still works

### Memory Usage
- Each blob URL consumes memory
- Properly cleaned up on unmount
- Typical gallery: 50 media × 1-5MB = 50-250MB

**Acceptable** for typical usage.

---

## Testing

### Manual Test
1. Login to application
2. Go to `/gallery`
3. Should see all images and videos
4. No 401 errors in console
5. Media loads correctly

### Browser Console Check
```javascript
// Should NOT see:
// GET /api/media/{id} 401

// Should see:
// GET /api/media/{id} 200
// (but not visible as external requests - internal to blob creation)
```

---

## Files Changed

### `components/gallery/MediaGallery.tsx`

**Added:**
- `blobUrls` state
- `createBlobUrl` function
- Blob URL creation in `loadMedia`
- Cleanup `useEffect` for blob URLs

**Modified:**
- `<img src={blobUrls[item.id] || item.url}>`
- `<video src={blobUrls[item.id] || item.url}>`
- `loadMedia` dependency array includes `createBlobUrl`

---

## Deployment

### No Backend Changes Required
- Pure frontend fix
- No database migration
- No API changes

### Restart Frontend

```bash
# Build and restart
npm run build
docker-compose restart frontend

# Or dev mode
npm run dev
```

### Verify

1. Open `/gallery` in browser
2. Open DevTools → Network tab
3. Should see media loading without 401 errors
4. Images and videos display correctly

---

## Troubleshooting

### Issue: Media still shows 401
**Solution**: Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

### Issue: Gallery loads slowly
**Expected**: First load fetches all media
**Mitigation**: Reduce gallery limit or implement pagination

### Issue: Memory usage high
**Expected**: Blob URLs consume memory
**Solution**: They're cleaned up on unmount automatically

### Issue: Some media doesn't load
**Check**: Console for specific media fetch errors
**Debug**: `createBlobUrl` logs errors for individual media

---

## Future Improvements

Possible enhancements:
- [ ] **Lazy blob creation** - Create blob URLs only when scrolling into view
- [ ] **Caching layer** - Store blob URLs in IndexedDB
- [ ] **Pagination** - Load media in batches
- [ ] **Progressive loading** - Show thumbnails first, full media on demand

---

## Security

### Before Fix
- ❌ Media endpoints required auth
- ❌ But browser couldn't send auth headers
- ❌ Result: 401 errors

### After Fix
- ✅ Media endpoints still require auth
- ✅ Gallery fetches with proper auth
- ✅ Blob URLs are temporary and local
- ✅ No security compromise

---

## Documentation Updates

- ✅ **`Changelog.md`** - Version 3.2.0, "Gallery Authentication" fix
- ✅ **`GALLERY-AUTH-FIX.md`** - This comprehensive guide

---

**Gallery authentication is now working correctly!** 🔒

Version: 3.2.0
Date: 2025-11-11
Issue: 401 errors in gallery
Fix: Blob URL approach with authentication
Status: ✅ Complete
Build: ✅ Passing

