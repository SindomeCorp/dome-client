// Copyright 2011 William Malone (www.williammalone.com)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export default function BarGraph(ctx) {

  // Private properties and methods

  const self = this;
  let startArr;
  let endArr;
  let looping = false;

  // Loop method adjusts the height of bar and redraws if necessary
  function loop() {

    let delta;
    let animationComplete = true;

    // Boolean to prevent update function from looping if already looping
    looping = true;

    // For each bar
    for (let i = 0; i < endArr.length; i += 1) {
      // Change the current bar height toward its target height
      delta = (endArr[i] - startArr[i]) / self.animationSteps;
      self.curArr[i] += delta;
      // If any change is made then flip a switch
      if (delta) {
        animationComplete = false;
      }
    }
    // If no change was made to any bars then we are done
    if (animationComplete) {
      looping = false;
    } else {
      // Draw and call loop again
      draw(self.curArr);
      setTimeout(loop, self.animationInterval / self.animationSteps);
    }
  }

  // Draw method updates the canvas with the current display
  function draw(arr) {

    const numOfBars = arr.length;
    let barWidth;
    let barHeight;
    let ratio;
    let maxBarHeight;
    const graphAreaWidth = self.width;
    const graphAreaHeight = self.height;

    // Update the dimensions of the canvas only if they have changed
    if (ctx.canvas.width !== self.width || ctx.canvas.height !== self.height) {
      ctx.canvas.width = self.width;
      ctx.canvas.height = self.height;
    }

    ctx.clearRect(0, 0, self.width, self.height);

    // Calculate dimensions of the bar
    barWidth = self.fixedBarWidth || (graphAreaWidth / numOfBars - self.margin * 2);
    maxBarHeight = graphAreaHeight - 1;

    // Determine the largest value in the bar array
    let largestValue = 0;
    for (let i = 0; i < arr.length; i += 1) {
      if (arr[i] > largestValue) {
        largestValue = arr[i];
      }
    }

    // For each bar
    for (let i = 0; i < arr.length; i += 1) {
      // Set the ratio of current bar compared to the maximum
      if (self.maxValue) {
        ratio = arr[i] / self.maxValue;
      } else {
        ratio = arr[i] / largestValue;
      }

      barHeight = ratio * maxBarHeight;

      // Draw bar background
      ctx.fillStyle = self.baseColor || "#333";
      ctx.fillRect(
        self.margin + i * self.width / numOfBars,
        graphAreaHeight - barHeight,
        barWidth,
        barHeight
      );
    }
  }

  // Public properties and methods

  this.width = 300;
  this.height = 150;
  this.maxValue = undefined;
  this.fixedBarWidth = false;
  this.margin = 5;
  this.curArr = [];
  this.baseColor = "#333";
  this.animationInterval = 1;
  this.animationSteps = 1;

  // Update method sets the end bar array and starts the animation
  this.update = function (newArr) {

    // If length of target and current array is different
    if (self.curArr.length !== newArr.length) {
      self.curArr = newArr;
      draw(newArr);
    } else {
      // Set the starting array to the current array
      startArr = self.curArr;
      // Set the target array to the new array
      endArr = newArr;
      // Animate from the start array to the end array
      if (!looping) {
        loop();
      }
    }
  };
}
