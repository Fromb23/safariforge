import { describe,expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ItineraryRenderer } from "@/components/ItineraryRenderer";
import type { ItineraryDocument,MediaRecord } from "@/types";

const media:MediaRecord[]=["hero","one","two"].map((id,index)=>({id,originalName:`${id}.jpg`,mimeType:"image/jpeg",width:1200,height:800,tags:["test"],altText:`Photo ${index+1}`,createdAt:"2026-01-01T00:00:00Z"}));
describe("shared itinerary rendering",()=>{
 it("renders every supported block and stable chronological sections",()=>{const document:ItineraryDocument={title:"Journal",subtitle:"Private",travelerName:"Asha",sections:[{id:"later",title:"Day two",startDate:"2027-01-02",blocks:[{id:"p2",type:"paragraph",text:"Second day remains in the document."}]},{id:"first",title:"Day one",startDate:"2027-01-01",heroMediaId:"hero",blocks:[{id:"h",type:"heading",text:"Heading copy"},{id:"p",type:"paragraph",text:"Paragraph copy"},{id:"l",type:"list",items:["List copy"]},{id:"f",type:"facts",title:"Facts title",items:[{label:"Drive",value:"Morning"}]},{id:"g",type:"imageGrid",mediaIds:["one","two"]},{id:"c",type:"carousel",mediaIds:["two","one"]}]}]};const html=renderToStaticMarkup(createElement(ItineraryRenderer,{document,media}));for(const value of ["Heading copy","Paragraph copy","List copy","Facts title","Second day remains in the document.","Section image carousel","1 / 2"])expect(html).toContain(value);expect(html.indexOf("Day one")).toBeLessThan(html.indexOf("Day two"));expect((html.match(/story-section/g)||[])).toHaveLength(2)});
 it("does not invent images for empty selections",()=>{const document:ItineraryDocument={title:"Empty media",subtitle:"",travelerName:"Traveler",sections:[{id:"a",title:"Only",blocks:[{id:"empty",type:"carousel",mediaIds:[]}]}]};const html=renderToStaticMarkup(createElement(ItineraryRenderer,{document,media:[]}));expect(html).not.toContain("Section image carousel");expect(html).not.toContain("Safari photograph")});
});
