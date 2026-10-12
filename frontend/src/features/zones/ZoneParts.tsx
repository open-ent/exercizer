import { Button, MediaLibrary, useEdificeClient, useMediaLibrary } from '@open-ent/react';
import {
  CSSProperties,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import { BlockKind, fillTextSlots, Size, toScreen, ZONE_SLOT } from '../../zones';

/**
 * Le texte d'un « texte à trous », avec un composant React monté à l'emplacement de chaque zone.
 *
 * Le HTML est posé à la main (et non par `dangerouslySetInnerHTML`) : React ne doit pas voir ces
 * nœuds, sans quoi il les réécrirait à chaque rendu et démonterait les champs en cours de
 * saisie. Les zones, elles, sont de vrais composants, montés par portail dans leur emplacement.
 */
export function FillTextHtml({
  html,
  renderZone,
}: {
  html: string | undefined;
  renderZone: (zoneId: number) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const slotsHtml = useMemo(() => fillTextSlots(html), [html]);
  const [slots, setSlots] = useState<Array<{ id: number; element: Element }>>([]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    node.innerHTML = slotsHtml;
    setSlots(
      Array.from(node.querySelectorAll(`[${ZONE_SLOT}]`)).map((element) => ({
        id: Number(element.getAttribute(ZONE_SLOT)),
        element,
      })),
    );
  }, [slotsHtml]);

  return (
    <>
      <div ref={container} className="exercizer-fill-text" />
      {slots.map((slot, index) => createPortal(renderZone(slot.id), slot.element, `${slot.id}-${index}`))}
    </>
  );
}

export interface ZoneGeometry {
  view: Size;
  natural: Size;
}

/**
 * Une image de fond et ce qu'on pose dessus.
 *
 * Les positions sont enregistrées dans un repère de 760 × 600 (`zones.ts`) : le cadre garde ce
 * rapport, l'image s'y ajuste sans déformation, et les blocs ne sont posés qu'une fois ses
 * dimensions connues — avant, ils s'empileraient tous dans le coin.
 */
export function ZoneCanvas({
  image,
  alt,
  children,
}: {
  image: string | undefined;
  alt: string;
  children: (geometry: ZoneGeometry) => ReactNode;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [geometry, setGeometry] = useState<ZoneGeometry | null>(null);

  useEffect(() => {
    const node = img.current;
    if (!node) return;
    const measure = () => {
      if (!node.naturalWidth || !node.clientWidth) return;
      setGeometry({
        view: { width: node.clientWidth, height: node.clientHeight },
        natural: { width: node.naturalWidth, height: node.naturalHeight },
      });
    };
    measure();
    node.addEventListener('load', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      node.removeEventListener('load', measure);
      observer?.disconnect();
    };
  }, [image]);

  return (
    <div className="position-relative border rounded overflow-hidden" style={{ maxWidth: 760 }}>
      <img
        ref={img}
        src={image || illuExercizer}
        alt={alt}
        draggable={false}
        style={{ display: 'block', width: '100%', aspectRatio: '760 / 600', objectFit: 'contain' }}
      />
      {geometry && children(geometry)}
    </div>
  );
}

/** Le style d'un bloc posé sur l'image, à partir de sa position enregistrée. */
export function blockStyle(
  position: { x: number; y: number; z?: number } | undefined,
  geometry: ZoneGeometry,
  kind: BlockKind,
): CSSProperties {
  const { left, top } = toScreen(
    position ?? { x: 0, y: 0 },
    geometry.view,
    geometry.natural,
    kind,
  );
  return { position: 'absolute', left, top, zIndex: position?.z ?? 0 };
}

/** Ce que rend la médiathèque varie selon le type demandé : un lien, un document, ou une liste. */
export function pickedImageUrl(result: unknown): string | null {
  const picked = Array.isArray(result) ? result[0] : result;
  if (!picked) return null;
  if (typeof picked === 'string') return picked;
  const doc = picked as { _id?: string; src?: string };
  if (doc.src) return doc.src;
  return doc._id ? `/workspace/document/${doc._id}` : null;
}

/** Un bouton qui ouvre la médiathèque et rend le lien de l'image choisie. */
export function PickImageButton({
  label,
  variant = 'outline',
  onPick,
}: {
  label: string;
  variant?: 'outline' | 'filled' | 'ghost';
  onPick: (url: string) => void;
}) {
  const { appCode } = useEdificeClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  return (
    <>
      <Button
        color="primary"
        variant={variant}
        onClick={() => mediaLibraryRef.current?.show('image')}
      >
        {label}
      </Button>
      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        multiple={false}
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={(result) => {
          const url = pickedImageUrl(result);
          if (url) onPick(url);
          mediaLibraryHandlers.onSuccess(result);
        }}
      />
    </>
  );
}
