// e.g. '29 août 2022' -> 2022-08-29
function frenchDateToJsDate(date?: string) {
  const monthMap: Record<string, string> = {
    'janvier': '01',
    'février': '02',
    'mars': '03',
    'avril': '04',
    'mai': '05',
    'juin': '06',
    'juillet': '07',
    'août': '08',
    'septembre': '09',
    'octobre': '10',
    'novembre': '11',
    'décembre': '12',
  }
  const dateFragments = date?.match(/(.+) (.+) (.+)/)
  if (!dateFragments || dateFragments.length < 4) {
    return undefined
  }
  return `${dateFragments[3]}-${monthMap[dateFragments[2]]}-${dateFragments[1]}`
}

function fixResizeBehaviorWhenMouseEntersIframe(iframe: HTMLIFrameElement) {
  iframe.addEventListener('mouseenter', (e) => {
    if (e.buttons !== 0) {
      iframe.style.pointerEvents = 'none'
    }
  })
  document.addEventListener('mouseup', () => {
    iframe.style.pointerEvents = 'auto'
  })
}

function injectIframe(): [HTMLIFrameElement, HTMLDivElement, HTMLDivElement, HTMLButtonElement] {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('style', 'width: 100%; height: 100%; border: none;');
  iframe.src = chrome.runtime.getURL('index.html');
  const wrapper = document.createElement('div');
  wrapper.setAttribute('id', 'house-locator-iframe');
  wrapper.setAttribute('style',
    'transition: margin-left 0.25s; border: none; background: white; top: 0; left: 0; width: 600px; height: 100%; z-index: 2147483650; position: fixed;',
  );
  wrapper.appendChild(iframe);
  const handle = document.createElement('div');
  handle.setAttribute('id', 'house-locator-handle');
  handle.setAttribute('style',
    'cursor: col-resize; width: 20px; height: 100%; position: absolute; right: -10px; top: 0',
  );
  wrapper.appendChild(handle);
  document.body.appendChild(wrapper);
  const collapseButton = document.createElement('button');
  collapseButton.innerText = '«'
  collapseButton.setAttribute('id', 'collapse-sidebar');
  collapseButton.setAttribute('style', 'height: 40px; line-height: 40px; position: absolute; border: 0; right: 0; text-decoration: none; background: white; border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,.3); color: rgb(25,25,25); font-family: Roboto,Arial,sans-serif; font-size: 30px; padding: 0 12px; margin-top: 10px; margin-right: 10px; flex-direction: column; align-items: center');
  wrapper.appendChild(collapseButton)
  return [iframe, wrapper, handle, collapseButton]
}

function sendDataToIframe(city?: string, surface?: string, energyClass?: string, emissionsClass?: string, dpeDate?: string, energy?: string, emissions?: string) {
  chrome.runtime.onMessage.addListener(async () => {
    await chrome.runtime.sendMessage(JSON.stringify({city, surface, energyClass, emissionsClass, dpeDate, energy, emissions}))
  });
}

async function scrapeDataFromWebsiteAndSendToIframe() {
  if (window.location.href.match(/bienici\.com/)) {
    sendDataToIframe(
      document.querySelector('.fullAddress')?.textContent?.toLowerCase()?.match(/(montauban|albi)/)?.[0],
      document.querySelectorAll('.allDetails > div')?.[4]?.textContent?.replaceAll(' ', '')?.replace('m² de terrain', ''),
      document.querySelector('.dpe-line__classification > span > div')?.textContent
      ?? document.querySelector('.energy-diagnostic__dpe .energy-diagnostic-rating__classification')?.textContent ?? undefined,
      document.querySelector('.ges-line__classification')?.textContent
      ?? document.querySelector('.energy-diagnostic__ges .energy-diagnostic-rating__classification')?.textContent ?? undefined,
      frenchDateToJsDate(document.querySelectorAll('.allDetails > div')?.[7]?.textContent?.match(/: (.+)$/)?.[1]),
      document.querySelectorAll('.dpe-data')?.[0]?.querySelector('.value')?.textContent
      ?? document.querySelector('.energy-diagnostic__dpe .energy-diagnostic-rating__value')?.textContent ?? undefined,
      document.querySelectorAll('.dpe-data')?.[1]?.querySelector('.value')?.textContent?.replace('*', '')
      ?? document.querySelector('.energy-diagnostic__ges .energy-diagnostic-rating__value')?.textContent ?? undefined,
    )
  }
  if (window.location.href.match(/leboncoin\.fr/)) {
    const dpe = (i: number) => document.querySelectorAll('div[data-test-id="energy-criteria"]')[i]?.querySelector('div[class*="active"]')?.textContent ?? undefined
    sendDataToIframe(
      document.querySelector('a[href=\'#map\']')?.textContent?.toLowerCase()?.match(/^(montauban|albi)/)?.[0],
      document.querySelector('div[data-qa-id="criteria_item_land_plot_surface"]')?.querySelector('span')?.textContent?.match(/\d+/)?.[0],
      dpe(0),
      dpe(1),
    )
  }
}

function toggleIframe() {
  document.getElementById('house-locator-iframe')!.style.display = document.getElementById('house-locator-iframe')!.style.display === 'none' ? 'block' : 'none'
}

function addCollapsability(wrapper: HTMLDivElement, handle: HTMLDivElement, collapseButton: HTMLButtonElement) {
  collapseButton.onclick = () => wrapper.style.marginLeft = `calc(20px - ${wrapper.style.width})`;
  wrapper.onmouseenter = () => {
    if (!(handle as any).isResizing) {
      wrapper.style.marginLeft = '0';
    }
  }
}

function addResizability(handle: HTMLDivElement, wrapper: HTMLDivElement) {
  handle.onmousedown = (e) => {
    e.preventDefault()
    if (e.buttons === 1) {
      (handle as any).isResizing = true;
    }
  }
  document.onmousemove = e => {
    if ((handle as any).isResizing) {
      wrapper.style.width = `${e.clientX}px`;
    }
  }
  document.onmouseup = e => {
    if ((handle as any).isResizing) {
      e.preventDefault();
      (handle as any).isResizing = false
    }
  }
}

(async () => {
  if (document.getElementById('house-locator-iframe')) {
    toggleIframe()
  } else {
    const [iframe, wrapper, handle, collapseButton] = injectIframe();
    fixResizeBehaviorWhenMouseEntersIframe(iframe);
    addCollapsability(wrapper, handle, collapseButton)
    addResizability(handle, wrapper)
    scrapeDataFromWebsiteAndSendToIframe();
  }
})()


