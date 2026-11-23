// Renders a core.view() page on the G2 through the Even Hub SDK, and turns SDK events
// into core inputs. Full rebuilds only when the layout changes; text-only changes use
// textContainerUpgrade so the BLE link is not flooded.
import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, ListContainerProperty,
  ListItemContainerProperty, MenuContainerProperty, MenuItemProperty, TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';

export function makeGlasses(bridge) {
  let started = false;
  let last = null; // {key, sig, texts}

  function containers(p) {
    let id = 1;
    const textObject = p.texts.map(t => new TextContainerProperty({
      xPosition: t.x, yPosition: t.y, width: t.w, height: t.h,
      borderWidth: 0, paddingLength: 6, containerID: id++, containerName: t.name,
      content: t.content, isEventCapture: t.capture ? 1 : 0, textColor: t.brightness,
    }));
    const listObject = p.lists.map(l => new ListContainerProperty({
      xPosition: l.x, yPosition: l.y, width: l.w, height: l.h,
      borderWidth: 1, borderColor: 5, borderRadius: 6, paddingLength: 4,
      containerID: id++, containerName: l.name, isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({ itemCount: l.items.length, itemWidth: l.w - 8, isItemSelectBorderEn: 1, itemName: l.items }),
    }));
    const menuObject = new MenuContainerProperty({ menuItems: p.menu.map(m => new MenuItemProperty({ itemID: m.id, itemName: m.name })) });
    return { containerTotalNum: textObject.length + listObject.length, textObject, listObject, menuObject };
  }

  const sig = p => JSON.stringify([p.key, p.texts.map(t => [t.name, t.x, t.y, t.w, t.h, t.capture, t.brightness]), p.lists]);

  return {
    async render(p) {
      const s = sig(p);
      if (started && last && last.sig === s) {
        // Same layout: only push text that changed.
        for (let i = 0; i < p.texts.length; i++) {
          if (p.texts[i].content !== last.texts[i]) {
            await bridge.textContainerUpgrade(new TextContainerUpgrade({
              containerID: i + 1, containerName: p.texts[i].name, contentOffset: 0,
              contentLength: Math.max(last.texts[i].length, p.texts[i].content.length) + 8, content: p.texts[i].content,
            }));
          }
        }
      } else if (!started) {
        const r = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(containers(p)));
        started = r === 0 || r === 'success' || r === true;
        if (!started) { console.warn('createStartUpPageContainer ->', r); return false; }
      } else {
        await bridge.rebuildPageContainer(new RebuildPageContainer(containers(p)));
      }
      last = { key: p.key, sig: s, texts: p.texts.map(t => t.content) };
      return true;
    },
  };
}

// SDK event -> core input (or null). Protobuf drops zero values, so a missing eventType
// on a list/text event is a click.
export function toInput(ev) {
  if (ev.menuItemClickEvent) return { kind: 'menu', itemId: ev.menuItemClickEvent.itemID };
  const e = ev.listEvent || ev.textEvent || ev.sysEvent;
  if (!e) return null;
  const type = e.eventType ?? OsEventTypeList.CLICK_EVENT;
  const index = ev.listEvent ? (ev.listEvent.currentSelectItemIndex ?? 0) : undefined;
  switch (type) {
    case OsEventTypeList.CLICK_EVENT: return { kind: 'click', index };
    case OsEventTypeList.DOUBLE_CLICK_EVENT: return { kind: 'double', index };
    case OsEventTypeList.LONG_PRESS_EVENT: return { kind: 'long', index };
    case OsEventTypeList.LONG_PRESS_RELEASE_EVENT: return { kind: 'release', index };
    case OsEventTypeList.SCROLL_TOP_EVENT: return { kind: 'up', index };
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: return { kind: 'down', index };
    case OsEventTypeList.FOREGROUND_ENTER_EVENT: return { kind: 'foreground' };
    default: return null;
  }
}
