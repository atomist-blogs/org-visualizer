function sunburst(name, dataUrl, pWidth, pHeight) {
    const minDiameterInPixels = 100;

    const width = Math.max(pWidth || window.innerWidth, minDiameterInPixels),
        height = Math.max(pHeight || window.innerHeight, minDiameterInPixels),
        maxRadius = (Math.min(width, height) / 2) - 5;
    const viewBoxSide = maxRadius * 2 + 10;

    const formatNumber = d3.format(',d');

    const x = d3.scaleLinear()
        .range([0, 2 * Math.PI])
        .clamp(true);

    const y = d3.scaleSqrt()
        .range([maxRadius * .1, maxRadius]);

    const color = d3.scaleOrdinal(d3.schemeCategory20);

    const partition = d3.partition();

    const arc = d3.arc()
        .startAngle(d => x(d.x0))
        .endAngle(d => x(d.x1))
        .innerRadius(d => Math.max(0, y(d.y0)))
        .outerRadius(d => Math.max(0, y(d.y1)));

    const middleArcLine = d => {
        const halfPi = Math.PI / 2;
        const angles = [x(d.x0) - halfPi, x(d.x1) - halfPi];
        const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);

        const middleAngle = (angles[1] + angles[0]) / 2;
        const invertDirection = middleAngle > 0 && middleAngle < Math.PI; // On lower quadrants write text ccw
        if (invertDirection) {
            angles.reverse();
        }

        const path = d3.path();
        path.arc(0, 0, r, angles[0], angles[1], invertDirection);
        return path.toString();
    };

    const textFits = d => {
        const CHAR_SPACE = 6;

        const deltaAngle = x(d.x1) - x(d.x0);
        const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);
        const perimeter = r * deltaAngle;

        return d.data.name.length * CHAR_SPACE < perimeter;
    };

    const dataDiv = d3.select("#dataAboutWhatYouClicked");

    const svg = d3.select('#putSvgHere').append('svg')
        .style('width', viewBoxSide + "px")
        .attr('viewBox', `${-viewBoxSide / 2} ${-viewBoxSide / 2} ${viewBoxSide} ${viewBoxSide}`)
        .on('click', () => focusOn()); // Reset zoom on canvas click

    d3.json(dataUrl, (error, root) => {
        if (error) throw error;

        console.log(JSON.stringify(root));

        if (root.children.length === 0) {
            alert("No data for " + name);
            return;
        }

        root = d3.hierarchy(root);
        root.sum(d => d.size);

        const slice = svg.selectAll('g.slice')
            .data(partition(root).descendants());

        slice.exit().remove();

        const newSlice = slice.enter()
            .append('g').attr('class', 'slice')
            .on('click', d => {
                d3.event.stopPropagation();
                const workspaceId = "local";
                const setIdealLink = `<button id="setIdeal"
                    onclick="postSetIdeal('${workspaceId}','${d.data.id}')"
                    >Set as ideal</button><label for="setIdeal" id="setIdealLabel" class="nothingToSay"></label>`;
                let descriptionOfWhereYouClicked = `${d.data.name}`;
                for (let place = d; place = place.parent; !!place) {
                    descriptionOfWhereYouClicked = place.data.name + "<br/>" + descriptionOfWhereYouClicked;
                }
                console.log("Clicked on " + d.data.name);
                if (d.data.size === 1) {
                    descriptionOfWhereYouClicked = descriptionOfWhereYouClicked +
                        `<br/><a href="${d.data.url}">${d.data.url}</a>`;
                }
                if (!!d.data.sha) {
                    descriptionOfWhereYouClicked = descriptionOfWhereYouClicked +
                        "<br/>" + setIdealLink;
                }
                dataDiv.html(descriptionOfWhereYouClicked);
                focusOn(d);
            });

        newSlice.append('title')
            .text(d => d.data.name + '\n' + formatNumber(d.value));

        newSlice.append('path')
            .attr('class', 'main-arc')
            .style('fill', d => color((d.children ? d : d.parent).data.name))
            .attr('d', arc);

        newSlice.append('path')
            .attr('class', 'hidden-arc')
            .attr('id', (_, i) => `hiddenArc${i}`)
            .attr('d', middleArcLine);

        const text = newSlice.append('text')
            .attr('display', d => textFits(d) ? null : 'none');

        // Add white contour
        text.append('textPath')
            .attr('class', 'textOutline')
            .attr('startOffset', '50%')
            .attr('xlink:href', (_, i) => `#hiddenArc${i}`)
            .text(d => d.data.name);

        text.append('textPath')
            .attr('startOffset', '50%')
            .attr('xlink:href', (_, i) => `#hiddenArc${i}`)
            .text(d => d.data.name);
    });

    function focusOn(d = { x0: 0, x1: 1, y0: 0, y1: 1 }) {
        // Reset to top-level if no data point specified

        const transition = svg.transition()
            .duration(750)
            .tween('scale', () => {
                const xd = d3.interpolate(x.domain(), [d.x0, d.x1]),
                    yd = d3.interpolate(y.domain(), [d.y0, 1]);
                return t => {
                    x.domain(xd(t));
                    y.domain(yd(t));
                };
            });

        transition.selectAll('path.main-arc')
            .attrTween('d', d => () => arc(d));

        transition.selectAll('path.hidden-arc')
            .attrTween('d', d => () => middleArcLine(d));

        transition.selectAll('text')
            .attrTween('display', d => () => textFits(d) ? null : 'none');

        moveStackToFront(d);

        function moveStackToFront(elD) {
            svg.selectAll('.slice').filter(d => d === elD)
                .each(function (d) {
                    this.parentNode.appendChild(this); // move all parents to the end of the line
                    if (d.parent) {
                        moveStackToFront(d.parent);
                    }
                })
        }
    }
};

function postSetIdeal(workspaceId, fingerprintId) {
    const postUrl = `./api/v1/${workspaceId}/ideal/${fingerprintId}`;
    const labelElement = document.getElementById("setIdealLabel");
    fetch(postUrl, { method: 'POST' }).then(response => {
        if (response.ok) {
            console.log("yay")
            labelElement.textContent = "ideal set, woo";
            labelElement.setAttribute("class", "success");
            labelElement.setAttribute("display", "static");
        }
        else {
            console.log("oh no");
            labelElement.textContent = "failed to set. consult the server logaments";
            labelElement.setAttribute("class", "error");
        }
    },
        e => {
            console.log("boo");
            labelElement.textContent = "Network error";
            labelElement.setAttribute("class", "error");
        });
}