const fs = require('node:fs'), assert = require('node:assert/strict');
const html=fs.readFileSync('public/city/agentic-city.html','utf8');
const source=html.slice(html.indexOf('function cityTime('),html.indexOf('function Simulation('));
const cityTime = new Function(source+';return cityTime')();
const at=h=>cityTime(new Date(2026,8,26,h,0,0));
assert.equal(at(0).night,1);assert.equal(at(12).night,0);
assert.ok(at(9).night<at(7).night);assert.ok(at(22).night>at(17).night);
for(let h=0;h<24;h++){assert.ok(at(h).night>=0&&at(h).night<=1);assert.equal(at(h).hour,h)}
console.log('PASS local clock, day/night bounds, morning and evening');
