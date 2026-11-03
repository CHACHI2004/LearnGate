import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, UserRound } from "lucide-react";
import { api, getApiError } from "@/services/api";
import { useAuth } from "./auth-context";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photo]);
  const mutation = useMutation({
    mutationFn: async () => api.patch("/users/me", { firstName, lastName }),
    onSuccess: async () => refresh(),
  });
  const photoMutation = useMutation({
    mutationFn: async () => {
      if (!photo) throw new Error("Choose a photo first.");
      const body = new FormData();
      body.append("profileImage", photo);
      return api.put("/users/me/profile-image", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: async () => {
      setPhoto(null);
      await refresh();
    },
  });
  if (!user) return null;
  return (
    <section className="form-page">
      <span className="eyebrow">ACCOUNT SETTINGS</span><h1>Your profile</h1>
      {mutation.isError && <div className="form-message form-error" role="alert">{getApiError(mutation.error)}</div>}
      {mutation.isSuccess && <div className="form-message form-success" role="status">Profile updated.</div>}
      {photoMutation.isError && <div className="form-message form-error" role="alert">{getApiError(photoMutation.error)}</div>}
      {photoMutation.isSuccess && <div className="form-message form-success" role="status">Profile photo updated.</div>}
      {photoError && <div className="form-message form-error" role="alert">{photoError}</div>}
      <section className="form-panel profile-photo-panel">
        <div className="profile-photo profile-photo-large">
          {photoPreview || user.profileImage
            ? <img alt={`${user.firstName} ${user.lastName} profile`} src={photoPreview || user.profileImage} />
            : <UserRound aria-hidden="true" size={35} />}
        </div>
        <div className="profile-photo-details">
          <strong>Profile photo</strong>
          <span>JPG, PNG, or WebP · up to 5 MB</span>
          <div className="profile-photo-actions">
            <label className="upload-button"><Camera size={16} /> Choose photo
              <input accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 5 * 1024 * 1024) {
                  setPhotoError("Profile photos must be 5 MB or smaller.");
                  setPhoto(null);
                  event.currentTarget.value = "";
                  return;
                }
                setPhotoError("");
                photoMutation.reset();
                setPhoto(file);
              }} type="file" />
            </label>
            <button className="primary-button" disabled={!photo || photoMutation.isPending} onClick={() => photoMutation.mutate()} type="button">
              {photoMutation.isPending ? "Uploading…" : "Save photo"}
            </button>
          </div>
          {photo && <span className="field-note">{photo.name}</span>}
        </div>
      </section>
      <form className="form-stack form-panel" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
        <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label>
        <label>Username<input value={user.username} readOnly /></label>
        <label>Email<input value={user.email} readOnly /></label>
        <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save profile"}</button>
      </form>
    </section>
  );
}
