'use client';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ImagePlus, Star, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, uploadOwnerImage } from '@/lib/connected';

export function ProductPhotos({
  images,
  csrf,
  disabled,
  onChange,
  onBusy,
}: {
  images: string[];
  csrf: string | null;
  disabled: boolean;
  onChange: (images: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const locked = uploading || disabled;
  const move = (index: number, direction: number) => {
    const reordered = [...images];
    [reordered[index], reordered[index + direction]] = [
      reordered[index + direction],
      reordered[index],
    ];
    onChange(reordered);
  };
  return (
    <section className="product-photos-editor" aria-label="Laptop photos">
      <h3>
        Photos <span>{images.length} / 12</span>
      </h3>
      <p className="portal-muted">
        The first photo is your cover. Add the screen, keyboard, ports and any
        wear so customers can see the laptop clearly.
      </p>
      {images.length > 0 && (
        <ol className="owner-photo-list">
          {images.map((image, index) => (
            <li className="owner-photo-card" key={image}>
              <Image
                src={image}
                width={240}
                height={180}
                unoptimized
                alt={`Product photo ${index + 1}`}
              />
              <div className="owner-photo-heading">
                <strong>
                  {index === 0 ? 'Cover photo' : `Photo ${index + 1}`}
                </strong>
                <button
                  className="photo-icon-button"
                  type="button"
                  disabled={locked}
                  aria-label={`Remove product photo ${index + 1}`}
                  onClick={() =>
                    onChange(images.filter((photo) => photo !== image))
                  }
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="owner-photo-actions">
                <button
                  type="button"
                  disabled={locked || index === 0}
                  onClick={() =>
                    onChange([
                      image,
                      ...images.filter((photo) => photo !== image),
                    ])
                  }
                  aria-label={`Use photo ${index + 1} as cover`}
                >
                  <Star size={14} aria-hidden="true" />
                  {index === 0 ? 'Cover' : 'Make cover'}
                </button>
                <button
                  type="button"
                  className="photo-icon-button"
                  disabled={locked || index === 0}
                  aria-label={`Move photo ${index + 1} earlier`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="photo-icon-button"
                  disabled={locked || index === images.length - 1}
                  aria-label={`Move photo ${index + 1} later`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <label className="receipt-picker product-photo-picker">
        <ImagePlus size={22} aria-hidden="true" />
        <span>
          {images.length ? 'Add more laptop photos' : 'Choose laptop photos'}
          <small>
            Select several · JPG, PNG or WebP · 3 MB each · up to 12 photos
          </small>
        </span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={locked || images.length >= 12}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (!files.length || locked) return;
            setError('');
            if (images.length + files.length > 12) {
              setError(
                'A laptop can have up to 12 photos. Remove a photo before adding more.',
              );
              return;
            }
            if (
              files.some(
                (file) =>
                  !['image/jpeg', 'image/png', 'image/webp'].includes(
                    file.type,
                  ) ||
                  file.size === 0 ||
                  file.size > 3 * 1024 * 1024,
              )
            ) {
              setError('Choose JPG, PNG or WebP photos up to 3 MB each.');
              return;
            }
            setUploading(true);
            onBusy(true);
            const uploaded = [...images];
            try {
              for (let i = 0; i < files.length; i++) {
                setProgress(`Uploading photo ${i + 1} of ${files.length}…`);
                const result = await uploadOwnerImage(files[i], csrf);
                uploaded.push(result.image);
                onChange([...uploaded]);
              }
            } catch (cause) {
              setError(
                `${errorMessage(cause)} Photos already uploaded are kept. Choose only the remaining photos to try again.`,
              );
            } finally {
              setUploading(false);
              onBusy(false);
              setProgress('');
            }
          }}
        />
      </label>
      {uploading && <output className="portal-muted">{progress}</output>}
      {!images.length && (
        <p className="portal-muted">
          Add at least one photo before saving this laptop.
        </p>
      )}
      <p className="portal-muted">
        Click Save product to publish your photo changes. Removing a photo from
        this laptop keeps the file available for any other listing that uses it.
      </p>
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
